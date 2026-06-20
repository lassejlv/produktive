use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use rand::RngCore;

use crate::{DeployError, DeployResult};

const PREFIX: &str = "v1";
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

#[derive(Clone)]
pub struct SecretCipher {
    key: [u8; KEY_LEN],
}

impl SecretCipher {
    pub fn from_hex_key(raw: &str) -> DeployResult<Self> {
        let raw = raw.trim();
        let decoded = hex::decode(raw).map_err(|_| {
            DeployError::Config("DEPLOY_SECRETS_KEY must be a 64-character hex key".into())
        })?;
        let key: [u8; KEY_LEN] = decoded.try_into().map_err(|_| {
            DeployError::Config("DEPLOY_SECRETS_KEY must decode to exactly 32 bytes".into())
        })?;
        Ok(Self { key })
    }

    pub fn encrypt(&self, plaintext: &str) -> DeployResult<String> {
        let cipher = ChaCha20Poly1305::new(Key::from_slice(&self.key));
        let mut nonce = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce);
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), plaintext.as_bytes())
            .map_err(|_| DeployError::Crypto("secret encryption failed".into()))?;
        Ok(format!(
            "{PREFIX}:{}:{}",
            hex::encode(nonce),
            hex::encode(ciphertext)
        ))
    }

    pub fn decrypt(&self, encoded: &str) -> DeployResult<String> {
        let parts: Vec<&str> = encoded.split(':').collect();
        if parts.len() != 3 || parts[0] != PREFIX {
            return Err(DeployError::Crypto(
                "unsupported encrypted secret format".into(),
            ));
        }
        let nonce = hex::decode(parts[1])
            .map_err(|_| DeployError::Crypto("invalid encrypted secret nonce".into()))?;
        let ciphertext = hex::decode(parts[2])
            .map_err(|_| DeployError::Crypto("invalid encrypted secret body".into()))?;
        if nonce.len() != NONCE_LEN {
            return Err(DeployError::Crypto("invalid encrypted secret nonce".into()));
        }
        let cipher = ChaCha20Poly1305::new(Key::from_slice(&self.key));
        let plaintext = cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|_| DeployError::Crypto("secret decryption failed".into()))?;
        String::from_utf8(plaintext)
            .map_err(|_| DeployError::Crypto("decrypted secret is not valid UTF-8".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypts_and_decrypts() {
        let cipher = SecretCipher::from_hex_key(
            "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
        )
        .unwrap();
        let encrypted = cipher.encrypt("super-secret").unwrap();
        assert_ne!(encrypted, "super-secret");
        assert_eq!(cipher.decrypt(&encrypted).unwrap(), "super-secret");
    }

    #[test]
    fn rejects_wrong_key_length() {
        assert!(SecretCipher::from_hex_key("abcd").is_err());
    }
}
