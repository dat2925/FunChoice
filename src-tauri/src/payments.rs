use crate::{db::Result, license::LicenseInfo, Data};
use reqwest::{Client, Method, Url};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::State;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

pub struct Payments {
    base: Option<Url>,
    client: Option<Client>,
}

impl Payments {
    pub fn new() -> Self {
        let configured = option_env!("FUNCHOICE_PRO_API_URL");
        #[cfg(debug_assertions)]
        let local = std::env::var("FUNCHOICE_PRO_API_URL").ok();
        #[cfg(debug_assertions)]
        let configured = local
            .as_deref()
            .or(configured)
            .or(Some("http://127.0.0.1:8787"));
        let base = configured
            .and_then(|value| Url::parse(value).ok())
            .filter(|url| {
                (url.scheme() == "https" || cfg!(debug_assertions) && local_origin(url))
                    && url.username().is_empty()
                    && url.password().is_none()
                    && url.path() == "/"
                    && url.query().is_none()
                    && url.fragment().is_none()
            });
        let client = base.as_ref().and_then(|_| {
            let _ = rustls::crypto::ring::default_provider().install_default();
            Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(5))
                .timeout(Duration::from_secs(23))
                .build()
                .ok()
        });
        Self { base, client }
    }

    async fn request(
        &self,
        method: Method,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> Result<Value> {
        let url = self
            .base
            .as_ref()
            .and_then(|base| base.join(path).ok())
            .ok_or("Thanh toán trực tuyến chưa được cấu hình.")?;
        let client = self
            .client
            .as_ref()
            .ok_or("Không thể khởi tạo kết nối thanh toán.")?;
        let mut request = client.request(method, url);
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request
            .send()
            .await
            .map_err(|_| "Không kết nối được dịch vụ Pro. Hãy thử lại khi có mạng.")?;
        let status = response.status();
        let value = response
            .json::<Value>()
            .await
            .map_err(|_| "Dịch vụ Pro trả về phản hồi không hợp lệ.")?;
        if !status.is_success() {
            return Err(value["error"]
                .as_str()
                .unwrap_or("Không thể hoàn tất yêu cầu Pro.")
                .into());
        }
        Ok(value)
    }
}

fn local_origin(url: &Url) -> bool {
    url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
}

fn credentials(id: &str, token: &str) -> Result<()> {
    if Uuid::parse_str(id).is_ok_and(|uuid| uuid.get_version_num() == 4 && uuid.to_string() == id)
        && token.len() == 64
        && token
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        Ok(())
    } else {
        Err("Mã đơn hàng hoặc mã khôi phục không hợp lệ.".into())
    }
}

fn apply_key(data: &Data, response: Value) -> Result<LicenseInfo> {
    let key = response["key"]
        .as_str()
        .ok_or("Dịch vụ chưa trả về key hợp lệ.")?;
    data.with_license(|license| license.activate(key))
}

#[tauri::command]
pub fn pro_purchase_available(payments: State<Payments>) -> bool {
    payments.base.is_some()
}

#[tauri::command]
pub async fn pro_plans(payments: State<'_, Payments>) -> Result<Value> {
    payments.request(Method::GET, "/v1/plans", None, None).await
}

#[tauri::command]
pub async fn pro_create_order(
    data: State<'_, Data>,
    payments: State<'_, Payments>,
    id: String,
    plan_id: String,
    token: String,
) -> Result<Value> {
    credentials(&id, &token)?;
    let (machine, current_key) = data.with_license(|license| license.purchase_context())?;
    payments
        .request(
            Method::POST,
            "/v1/orders",
            Some(&token),
            Some(json!({
                "id": id, "planId": plan_id, "machineCode": machine, "currentKey": current_key,
            })),
        )
        .await
}

#[tauri::command]
pub async fn pro_order_status(
    payments: State<'_, Payments>,
    id: String,
    token: String,
) -> Result<Value> {
    credentials(&id, &token)?;
    payments
        .request(Method::GET, &format!("/v1/orders/{id}"), Some(&token), None)
        .await
}

#[tauri::command]
pub async fn pro_claim(
    data: State<'_, Data>,
    payments: State<'_, Payments>,
    id: String,
    token: String,
) -> Result<LicenseInfo> {
    credentials(&id, &token)?;
    let result = payments
        .request(
            Method::POST,
            &format!("/v1/orders/{id}/key"),
            Some(&token),
            None,
        )
        .await?;
    apply_key(&data, result)
}

#[tauri::command]
pub async fn pro_recover(
    data: State<'_, Data>,
    payments: State<'_, Payments>,
    id: String,
    token: String,
) -> Result<LicenseInfo> {
    credentials(&id, &token)?;
    let machine = data.with_license(|license| {
        license
            .info()
            .machine_code
            .ok_or("Không đọc được mã máy.".into())
    })?;
    let result = payments
        .request(
            Method::POST,
            "/v1/licenses/recover",
            Some(&token),
            Some(json!({
                "orderId": id, "machineCode": machine,
            })),
        )
        .await?;
    apply_key(&data, result)
}

#[tauri::command]
pub fn pro_open_checkout(
    app: tauri::AppHandle,
    payments: State<Payments>,
    url: String,
) -> Result<()> {
    let parsed = Url::parse(&url).map_err(|_| "Liên kết thanh toán không hợp lệ.")?;
    let payos = parsed.scheme() == "https"
        && parsed.host_str() == Some("pay.payos.vn")
        && parsed.port().is_none()
        && parsed.path().starts_with("/web/");
    let mock = cfg!(debug_assertions)
        && local_origin(&parsed)
        && payments
            .base
            .as_ref()
            .is_some_and(|base| base.origin() == parsed.origin())
        && parsed.path().starts_with("/mock/checkout/");
    if (!payos && !mock) || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Liên kết thanh toán không hợp lệ.".into());
    }
    app.opener()
        .open_url(parsed.to_string(), None::<&str>)
        .map_err(|_| "Không mở được trang thanh toán.".into())
}
