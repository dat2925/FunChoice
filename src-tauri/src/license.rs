use crate::db::Result;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub const FREE_CLASSES: usize = 2;
pub const FREE_STUDENTS: usize = 30;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInfo {
    pub pro: bool,
    pub machine_code: Option<String>,
    pub needs_machine_key: bool,
    pub expires_at: Option<u64>,
    pub free_classes: usize,
    pub free_students: usize,
}

pub struct License {
    machine: Option<String>,
    file: PathBuf,
    grant: Option<Grant>,
    needs_machine_key: bool,
}

fn machine_code() -> Option<String> {
    use winreg::{
        enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY},
        RegKey,
    };
    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(
            r"SOFTWARE\Microsoft\Cryptography",
            KEY_READ | KEY_WOW64_64KEY,
        )
        .ok()?;
    let guid: String = key.get_value("MachineGuid").ok()?;
    if guid.trim().is_empty() {
        return None;
    }
    let hash = Sha256::digest(format!(
        "FunChoice:device:v1:{}",
        guid.trim().to_ascii_lowercase()
    ));
    Some(format!("FC-{}", hex::encode_upper(&hash[..16])))
}

#[derive(Clone, Copy)]
struct Grant {
    expires_at: Option<u64>,
}

impl Grant {
    fn active(self, now: u64) -> bool {
        self.expires_at.is_none_or(|expiry| now < expiry)
    }

    fn supersedes(self, current: Self) -> bool {
        match (self.expires_at, current.expires_at) {
            (None, Some(_)) => true,
            (Some(next), Some(old)) => next > old,
            _ => false,
        }
    }
}
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn verify(key: &str, machine: Option<&str>, public: &VerifyingKey) -> Option<Grant> {
    let mut parts = key.split('.');
    let version = parts.next()?;
    let expiry = parts.next()?;
    if expiry.len() > 12 {
        return None;
    }
    let expires_at = if expiry == "forever" {
        None
    } else {
        Some(expiry.parse().ok()?)
    };
    if version != "FC-PRO1" {
        return None;
    }
    let message = format!("FunChoice:Pro:v1:{}:{expiry}", machine?);
    let encoded = parts.next()?;
    if encoded.len() != 86 || parts.next().is_some() {
        return None;
    }
    let signature = Signature::from_slice(&URL_SAFE_NO_PAD.decode(encoded).ok()?).ok()?;
    public.verify_strict(message.as_bytes(), &signature).ok()?;
    Some(Grant { expires_at })
}

fn public_key() -> VerifyingKey {
    #[cfg(debug_assertions)]
    if let Ok(value) = std::env::var("FUNCHOICE_DEV_LICENSE_PUBLIC_KEY_HEX") {
        let mut bytes = [0; 32];
        if hex::decode_to_slice(value.trim(), &mut bytes).is_ok() {
            if let Ok(key) = VerifyingKey::from_bytes(&bytes) {
                return key;
            }
        }
    }
    let mut bytes = [0; 32];
    hex::decode_to_slice(include_str!("../pro-public.hex").trim(), &mut bytes)
        .expect("invalid Pro public key encoding");
    VerifyingKey::from_bytes(&bytes).expect("invalid Pro public key")
}

impl License {
    pub fn load(dir: &Path) -> Self {
        let machine = machine_code();
        let file = dir.join("funchoice-pro.key");
        let saved = std::fs::read_to_string(&file).ok();
        let grant = saved
            .as_deref()
            .and_then(|key| verify(key.trim(), machine.as_deref(), &public_key()));
        let needs_machine_key = saved.is_some_and(|key| key.trim().starts_with("FC-PRO2."));
        Self {
            machine,
            file,
            grant,
            needs_machine_key,
        }
    }

    pub fn pro(&self) -> bool {
        self.grant.is_some_and(|grant| grant.active(now()))
    }

    pub fn info(&self) -> LicenseInfo {
        LicenseInfo {
            pro: self.pro(),
            machine_code: self.machine.clone(),
            needs_machine_key: self.needs_machine_key,
            expires_at: self.grant.and_then(|grant| grant.expires_at),
            free_classes: FREE_CLASSES,
            free_students: FREE_STUDENTS,
        }
    }

    pub fn purchase_context(&self) -> Result<(String, Option<String>)> {
        let machine = self.machine.clone().ok_or("Không đọc được mã máy.")?;
        let key = std::fs::read_to_string(&self.file)
            .ok()
            .map(|key| key.trim().to_owned())
            .filter(|key| verify(key, Some(&machine), &public_key()).is_some());
        Ok((machine, key))
    }

    pub fn activate(&mut self, key: &str) -> Result<LicenseInfo> {
        use std::io::Write;
        let key = key.trim();
        if key.starts_with("FC-PRO2.") {
            return Err(
                "Key dùng chung đã ngừng hỗ trợ. Gửi mã máy cho SoloTech để nhận key riêng.".into(),
            );
        }
        let grant = verify(key, self.machine.as_deref(), &public_key()).ok_or(
            "Key không hợp lệ hoặc được cấp cho máy khác. Hãy kiểm tra lại key do SoloTech cấp.",
        )?;
        if !grant.active(now()) {
            return Err("Key Pro này đã hết hạn.".into());
        }
        if let Some(current) = self.grant {
            if current.expires_at == grant.expires_at {
                return Ok(self.info());
            }
            if !grant.supersedes(current) {
                return Err("Key mới sẽ làm giảm thời hạn Pro hiện tại.".into());
            }
        }
        let parent = self
            .file
            .parent()
            .ok_or("Không tìm thấy thư mục kích hoạt.")?;
        let mut temp =
            tempfile::NamedTempFile::new_in(parent).map_err(|_| "Không thể lưu key Pro.")?;
        temp.write_all(key.as_bytes())
            .map_err(|_| "Không thể lưu key Pro.")?;
        temp.persist(&self.file)
            .map_err(|_| "Không thể lưu key Pro.")?;
        self.grant = Some(grant);
        self.needs_machine_key = false;
        Ok(self.info())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn a_replacement_grant_can_extend_or_go_permanent_but_not_reduce_access() {
        let current = Grant {
            expires_at: Some(200),
        };
        let shorter = Grant {
            expires_at: Some(190),
        };
        let longer = Grant {
            expires_at: Some(210),
        };
        let forever = Grant { expires_at: None };
        assert!(!shorter.supersedes(current));
        assert!(!current.supersedes(current));
        assert!(longer.supersedes(current));
        assert!(forever.supersedes(current));
        assert!(!longer.supersedes(forever));
    }
    #[test]
    fn previously_signed_portable_keys_are_rejected() {
        let issuer = SigningKey::from_bytes(&[1; 32]);
        let serial = "00112233445566778899aabbccddeeff";
        let signed = |expiry| {
            let signature = issuer.sign(format!("FunChoice:Pro:v2:{expiry}:{serial}").as_bytes());
            format!(
                "FC-PRO2.{expiry}.{serial}.{}",
                URL_SAFE_NO_PAD.encode(signature.to_bytes())
            )
        };
        for machine in [None, Some("FC-A")] {
            assert!(verify(&signed("forever"), machine, &issuer.verifying_key()).is_none());
            assert!(verify(&signed("200"), machine, &issuer.verifying_key()).is_none());
        }
    }

    #[test]
    fn key_requires_the_matching_machine_and_issuer() {
        let issuer = SigningKey::from_bytes(&[1; 32]);
        let key = |expiry| {
            format!(
                "FC-PRO1.{expiry}.{}",
                URL_SAFE_NO_PAD.encode(
                    issuer
                        .sign(format!("FunChoice:Pro:v1:FC-A:{expiry}").as_bytes())
                        .to_bytes()
                )
            )
        };
        let timed = key("200");
        let grant = verify(&timed, Some("FC-A"), &issuer.verifying_key()).unwrap();
        assert!(grant.active(199));
        assert!(!grant.active(200));
        assert!(verify(&timed, Some("FC-B"), &issuer.verifying_key()).is_none());
        assert!(verify(
            &timed,
            Some("FC-A"),
            &SigningKey::from_bytes(&[2; 32]).verifying_key()
        )
        .is_none());
        assert!(verify(
            &timed.replace(".200.", ".201."),
            Some("FC-A"),
            &issuer.verifying_key()
        )
        .is_none());
        assert!(
            verify(&key("forever"), Some("FC-A"), &issuer.verifying_key())
                .unwrap()
                .active(u64::MAX)
        );
    }
}
