/**
 * E2E v1 Encryption Module — X25519 + HKDF-SHA-256 + XChaCha20-Poly1305
 *
 * Spec: PROJECT_MASTER_SPEC.md section 4.2 (E2E Encryption)
 *
 * - ECDH: crypto_scalarmult(ephemeral_priv, recipient_pub)
 * - KDF: HKDF-SHA-256 with salt = ek_pub(32) || recipient_pub(32),
 *         info = "agentverse-e2e-v1", output 32 bytes
 * - AEAD: XChaCha20-Poly1305 (24-byte nonce, 16-byte tag)
 * - Wire format: nonce(24) || encrypted_data || tag(16)
 * - AAD: event_id + pair_id + sender_pubkey (UTF-8 string concatenation)
 *
 * Ed25519 keypair (signing) != X25519 keypair (encryption) -- NEVER mix.
 */

import type sodium_t from "libsodium-wrappers";
import { createRequire } from "node:module";
import { extract, expand } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

// ── Types ───────────────────────────────────────────────────────

/** Additional authenticated data parts bound to the ciphertext. */
export interface AadParts {
  event_id: string;
  pair_id: string;
  sender_pubkey: string;
}

/** Result of encryptMessage: ciphertext (wire format) + ephemeral public key. */
export interface EncryptedMessage {
  ciphertext: Uint8Array;
  ephemeral_pubkey: Uint8Array;
}

/** X25519 keypair for E2E encryption (NOT Ed25519). */
export interface X25519Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

// ── Initialization ──────────────────────────────────────────────

let _ready = false;
let sodium: typeof sodium_t;

/**
 * Idempotent initialization of libsodium.
 * Must be called (and awaited) before using any other function in this module.
 *
 * Uses createRequire to load the CJS build of libsodium-wrappers,
 * working around a packaging bug in v0.7.16 where the ESM entry point
 * has a broken relative import for the underlying libsodium module.
 */
export async function initSodium(): Promise<void> {
  if (_ready) return;
  const require = createRequire(import.meta.url);
  sodium = require("libsodium-wrappers") as typeof sodium_t;
  await sodium.ready;
  _ready = true;
}

/**
 * Get the initialized sodium instance (for test use).
 * Throws if initSodium() has not been called.
 */
export function getSodium(): typeof sodium_t {
  if (!_ready) throw new Error("initSodium() must be called first");
  return sodium;
}

// ── Key Generation ──────────────────────────────────────────────

/**
 * Generate a fresh X25519 keypair for E2E encryption.
 * Returns 32-byte public and private keys.
 */
export function generateX25519Keypair(): X25519Keypair {
  const privateKey = sodium.randombytes_buf(sodium.crypto_scalarmult_SCALARBYTES);
  const publicKey = sodium.crypto_scalarmult_base(privateKey);
  return { publicKey, privateKey };
}

/**
 * Convert an Ed25519 key to its X25519 equivalent.
 *
 * @param key - The Ed25519 key bytes
 * @param type - "public" (32-byte Ed25519 public key) or
 *               "private" (64-byte Ed25519 secret key)
 * @returns 32-byte X25519 key
 */
export function ed25519KeyToX25519(key: Uint8Array, type: "public" | "private"): Uint8Array {
  if (type === "public") {
    return sodium.crypto_sign_ed25519_pk_to_curve25519(key);
  }
  return sodium.crypto_sign_ed25519_sk_to_curve25519(key);
}

// ── HKDF helper ─────────────────────────────────────────────────

const E2E_INFO = "agentverse-e2e-v1";

/**
 * Derive a 32-byte symmetric key from an ECDH shared secret using HKDF-SHA-256.
 *
 * salt = ephemeral_pub(32) || recipient_pub(32)
 * info = "agentverse-e2e-v1"
 */
function deriveKey(
  sharedSecret: Uint8Array,
  ephemeralPub: Uint8Array,
  recipientPub: Uint8Array,
): Uint8Array {
  // salt = ek_pub(32) || recipient_pub(32)
  const salt = new Uint8Array(64);
  salt.set(ephemeralPub, 0);
  salt.set(recipientPub, 32);

  // HKDF-SHA-256: extract then expand
  const prk = extract(sha256, sharedSecret, salt);
  return expand(sha256, prk, E2E_INFO, 32);
}

// ── AAD helper ──────────────────────────────────────────────────

/** Build AAD bytes from parts: UTF-8 encode(event_id + pair_id + sender_pubkey). */
function buildAad(parts: AadParts): Uint8Array {
  return sodium.from_string(parts.event_id + parts.pair_id + parts.sender_pubkey);
}

// ── Encrypt / Decrypt ───────────────────────────────────────────

/**
 * Encrypt a plaintext message for the given recipient.
 *
 * 1. Generate ephemeral X25519 keypair
 * 2. ECDH: sharedSecret = crypto_scalarmult(ek_priv, recipient_pub)
 * 3. KDF: derive 32-byte symmetric key via HKDF-SHA-256
 * 4. AEAD: XChaCha20-Poly1305 encrypt with random 24-byte nonce
 * 5. Wire format: nonce(24) || encrypted_data || tag(16)
 *
 * @param plaintext  - UTF-8 string to encrypt
 * @param recipientPub - Recipient's X25519 public key (32 bytes)
 * @param aadParts   - Additional authenticated data parts
 * @returns EncryptedMessage with ciphertext (wire format) and ephemeral public key
 */
export function encryptMessage(
  plaintext: string,
  recipientPub: Uint8Array,
  aadParts: AadParts,
): EncryptedMessage {
  // 1. Ephemeral keypair
  const ephemeral = generateX25519Keypair();

  // 2. ECDH
  const sharedSecret = sodium.crypto_scalarmult(ephemeral.privateKey, recipientPub);

  // 3. KDF
  const symmetricKey = deriveKey(sharedSecret, ephemeral.publicKey, recipientPub);

  // 4. Random nonce (24 bytes for XChaCha20)
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

  // 5. AAD
  const aad = buildAad(aadParts);

  // 6. Encrypt (returns encrypted_data || tag)
  const encryptedWithTag = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.from_string(plaintext),
    aad,
    null, // nsec (unused)
    nonce,
    symmetricKey,
  );

  // 7. Wire format: nonce(24) || encrypted_data || tag(16)
  const ciphertext = new Uint8Array(nonce.length + encryptedWithTag.length);
  ciphertext.set(nonce, 0);
  ciphertext.set(encryptedWithTag, nonce.length);

  return {
    ciphertext,
    ephemeral_pubkey: ephemeral.publicKey,
  };
}

/**
 * Decrypt a ciphertext that was encrypted with encryptMessage.
 *
 * 1. Parse wire format: nonce(24) || encrypted_data || tag(16)
 * 2. Derive recipient's public key from private key
 * 3. ECDH: sharedSecret = crypto_scalarmult(recipient_priv, ephemeral_pub)
 * 4. KDF: derive 32-byte symmetric key via HKDF-SHA-256
 * 5. AEAD: XChaCha20-Poly1305 decrypt
 *
 * @param ciphertext    - Wire-format ciphertext: nonce(24) || encrypted_data || tag(16)
 * @param ephemeralPub  - Sender's ephemeral X25519 public key (32 bytes)
 * @param recipientPriv - Recipient's X25519 private key (32 bytes)
 * @param aadParts      - Additional authenticated data parts (must match encryption)
 * @returns Decrypted plaintext string
 * @throws If decryption or authentication fails
 */
export function decryptMessage(
  ciphertext: Uint8Array,
  ephemeralPub: Uint8Array,
  recipientPriv: Uint8Array,
  aadParts: AadParts,
): string {
  const nonceLen = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES; // 24

  // 1. Parse wire format
  const nonce = ciphertext.slice(0, nonceLen);
  const encryptedWithTag = ciphertext.slice(nonceLen);

  // 2. Derive recipient public key from private key
  const recipientPub = sodium.crypto_scalarmult_base(recipientPriv);

  // 3. ECDH (commutative: recipient_priv * ephemeral_pub == ephemeral_priv * recipient_pub)
  const sharedSecret = sodium.crypto_scalarmult(recipientPriv, ephemeralPub);

  // 4. KDF
  const symmetricKey = deriveKey(sharedSecret, ephemeralPub, recipientPub);

  // 5. AAD
  const aad = buildAad(aadParts);

  // 6. Decrypt
  const plainBytes = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, // nsec (unused)
    encryptedWithTag,
    aad,
    nonce,
    symmetricKey,
  );

  return sodium.to_string(plainBytes);
}
