//! SSH key generation / import.

use russh::keys::ssh_key::{self, LineEnding};
use russh::keys::{Algorithm, HashAlg, PrivateKey};

use crate::error::{Ctx, Res};
use crate::vault::{new_id, now, Key};

fn finish(name: &str, key: &PrivateKey, passphrase: &str) -> Res<Key> {
    let public_key = key.public_key().to_openssh().s()?;
    let fingerprint = key.public_key().fingerprint(HashAlg::Sha256).to_string();
    let stored = if passphrase.is_empty() {
        key.to_openssh(LineEnding::LF).s()?.to_string()
    } else {
        key.encrypt(&mut russh::keys::key::safe_rng(), passphrase)
            .s()?
            .to_openssh(LineEnding::LF)
            .s()?
            .to_string()
    };
    Ok(Key {
        id: new_id(),
        name: name.to_string(),
        kind: key.algorithm().to_string(),
        private_key: stored,
        public_key,
        passphrase: passphrase.to_string(),
        fingerprint,
        created_at: now(),
    })
}

pub fn generate(name: &str, kind: &str, passphrase: &str) -> Res<Key> {
    let mut rng = russh::keys::key::safe_rng();
    let algo = match kind {
        "rsa" => Algorithm::Rsa { hash: None },
        "ecdsa" => Algorithm::Ecdsa { curve: ssh_key::EcdsaCurve::NistP256 },
        _ => Algorithm::Ed25519,
    };
    let key = if kind == "rsa" {
        let kp = ssh_key::private::RsaKeypair::random(&mut rng, 4096).s()?;
        PrivateKey::from(kp)
    } else {
        PrivateKey::random(&mut rng, algo).s()?
    };
    finish(name, &key, passphrase)
}

pub fn import(name: &str, pem: &str, passphrase: &str) -> Res<Key> {
    let pass = (!passphrase.is_empty()).then_some(passphrase);
    let key = russh::keys::decode_secret_key(pem, pass).ctx("cannot parse private key")?;
    let mut k = finish(name, &key, "")?;
    // Keep the user's original (possibly encrypted) material verbatim.
    k.private_key = pem.trim().to_string() + "\n";
    k.passphrase = passphrase.to_string();
    Ok(k)
}
