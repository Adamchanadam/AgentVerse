/**
 * E2E v1 Encryption Module — X25519 + HKDF-SHA-256 + XChaCha20-Poly1305
 *
 * Spec: PROJECT_MASTER_SPEC.md section 4.2 (E2E Encryption)
 *
 * - ECDH: x25519.getSharedSecret(ephemeral_priv, recipient_pub)
 * - KDF: HKDF-SHA-256 with salt = ek_pub(32) || recipient_pub(32),
 *         info = "agentverse-e2e-v1", output 32 bytes
 * - AEAD: XChaCha20-Poly1305 (24-byte nonce, 16-byte tag)
 * - Wire format: nonce(24) || encrypted_data || tag(16)
 * - AAD: event_id + pair_id + sender_pubkey (UTF-8 string concatenation)
 *
 * Ed25519 keypair (signing) != X25519 keypair (encryption) -- NEVER mix.
 *
 * Browser-safe: uses @noble/ciphers + @noble/curves (no Node-only deps).
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "@noble/ciphers/webcrypto";
import { edwardsToMontgomeryPub, edwardsToMontgomeryPriv, x25519 } from "@noble/curves/ed25519";
import { extract, expand } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "@noble/hashes/utils";

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

// ── Key Generation ──────────────────────────────────────────────

/**
 * Generate a fresh X25519 keypair for E2E encryption.
 * Returns 32-byte public and private keys.
 */
export function generateX25519Keypair(): X25519Keypair {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/**
 * Convert an Ed25519 key to its X25519 equivalent.
 *
 * @param key - The Ed25519 key bytes
 * @param type - "public" (32-byte Ed25519 public key) or
 *               "private" (32-byte Ed25519 seed)
 * @returns 32-byte X25519 key
 */
export function ed25519KeyToX25519(key: Uint8Array, type: "public" | "private"): Uint8Array {
  if (type === "public") {
    return edwardsToMontgomeryPub(key);
  }
  return edwardsToMontgomeryPriv(key);
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
  return utf8ToBytes(parts.event_id + parts.pair_id + parts.sender_pubkey);
}

// ── Encrypt / Decrypt ───────────────────────────────────────────

/**
 * Encrypt a plaintext message for the given recipient.
 *
 * 1. Generate ephemeral X25519 keypair
 * 2. ECDH: sharedSecret = x25519.getSharedSecret(ek_priv, recipient_pub)
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
  const sharedSecret = x25519.getSharedSecret(ephemeral.privateKey, recipientPub);

  // 3. KDF
  const symmetricKey = deriveKey(sharedSecret, ephemeral.publicKey, recipientPub);

  // 4. Random nonce (24 bytes for XChaCha20)
  const nonce = randomBytes(24);

  // 5. AAD
  const aad = buildAad(aadParts);

  // 6. Encrypt (returns encrypted_data || tag)
  const encryptedWithTag = xchacha20poly1305(symmetricKey, nonce, aad).encrypt(
    utf8ToBytes(plaintext),
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
 * 3. ECDH: sharedSecret = x25519.getSharedSecret(recipient_priv, ephemeral_pub)
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
  const NONCE_LEN = 24;

  // 1. Parse wire format
  const nonce = ciphertext.slice(0, NONCE_LEN);
  const encryptedWithTag = ciphertext.slice(NONCE_LEN);

  // 2. Derive recipient public key from private key
  const recipientPub = x25519.getPublicKey(recipientPriv);

  // 3. ECDH (commutative: recipient_priv * ephemeral_pub == ephemeral_priv * recipient_pub)
  const sharedSecret = x25519.getSharedSecret(recipientPriv, ephemeralPub);

  // 4. KDF
  const symmetricKey = deriveKey(sharedSecret, ephemeralPub, recipientPub);

  // 5. AAD
  const aad = buildAad(aadParts);

  // 6. Decrypt
  const plainBytes = xchacha20poly1305(symmetricKey, nonce, aad).decrypt(encryptedWithTag);

  return new TextDecoder().decode(plainBytes);
}
