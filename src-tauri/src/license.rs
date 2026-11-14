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
    pub expires_at: Option<u64>,
    pub free_classes: usize,
    pub free_students: usize,
}

pub struct License {
    machine: Option<String>,
    file: PathBuf,
    grant: Option<Grant>,
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
    let message = match version {
        "FC-PRO2" => {
            let serial = parts.next()?;
            if serial.len() != 32 || !serial.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                return None;
            }
            format!("FunChoice:Pro:v2:{expiry}:{serial}")
        }
        "FC-PRO1" => format!("FunChoice:Pro:v1:{}:{expiry}", machine?),
        _ => return None,
    };
    let encoded = parts.next()?;
    if encoded.len() != 86 || parts.next().is_some() {
        return None;
    }
    let signature = Signature::from_slice(&URL_SAFE_NO_PAD.decode(encoded).ok()?).ok()?;
    public.verify_strict(message.as_bytes(), &signature).ok()?;
    Some(Grant { expires_at })
}

fn public_key() -> VerifyingKey {
    let mut bytes = [0; 32];
    hex::decode_to_slice(include_str!("../pro-public.hex").trim(), &mut bytes)
        .expect("invalid Pro public key encoding");
    VerifyingKey::from_bytes(&bytes).expect("invalid Pro public key")
}

impl License {
    pub fn load(dir: &Path) -> Self {
        let machine = machine_code();
        let file = dir.join("funchoice-pro.key");
        let grant = std::fs::read_to_string(&file)
            .ok()
            .and_then(|key| verify(key.trim(), machine.as_deref(), &public_key()));
        Self {
            machine,
            file,
            grant,
        }
    }

    pub fn pro(&self) -> bool {
        self.grant.is_some_and(|grant| grant.active(now()))
    }

    pub fn info(&self) -> LicenseInfo {
        LicenseInfo {
            pro: self.pro(),
            expires_at: self.grant.and_then(|grant| grant.expires_at),
            free_classes: FREE_CLASSES,
            free_students: FREE_STUDENTS,
        }
    }

    pub fn activate(&mut self, key: &str) -> Result<LicenseInfo> {
        use std::io::Write;
        let key = key.trim();
        let grant = verify(key, self.machine.as_deref(), &public_key())
            .ok_or("Key không hợp lệ. Hãy kiểm tra lại key do SoloTech cấp.")?;
        if !grant.active(now()) {
            return Err("Key Pro này đã hết hạn.".into());
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
        Ok(self.info())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    #[test]
    fn portable_key_validates_on_any_machine_and_rejects_changes() {
        let issuer = SigningKey::from_bytes(&[1; 32]);
        let serial = "00112233445566778899aabbccddeeff";
        let signed = |expiry| {
            let signature = issuer.sign(format!("FunChoice:Pro:v2:{expiry}:{serial}").as_bytes());
            format!(
                "FC-PRO2.{expiry}.{serial}.{}",
                URL_SAFE_NO_PAD.encode(signature.to_bytes())
            )
        };
        let timed = signed("200");
        for machine in [None, Some("FC-A"), Some("FC-B")] {
            let grant = verify(&timed, machine, &issuer.verifying_key()).unwrap();
            assert!(grant.active(199));
            assert!(!grant.active(200));
            assert!(verify(&signed("forever"), machine, &issuer.verifying_key())
                .unwrap()
                .active(u64::MAX));
        }
        assert!(verify(
            &timed.replace(".200.", ".300."),
            None,
            &issuer.verifying_key()
        )
        .is_none());
        assert!(verify(
            &timed.replace(serial, "ffffffffffffffffffffffffffffffff"),
            None,
            &issuer.verifying_key()
        )
        .is_none());
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
