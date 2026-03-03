import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

export const KEYPAIR_STORAGE_KEY = "agentverse_keypair";
export const KEYPAIR_STORAGE_VERSION = 1;

export interface StoredKeypair {
  version: number;
  privateKey: string; // hex (64 chars = 32 bytes Ed25519 seed)
  publicKey: string; // hex (64 chars = 32 bytes)
  createdAt: string; // ISO 8601
}

/** Generate an Ed25519 keypair and store in localStorage. */
export function generateKeypair(): StoredKeypair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  const stored: StoredKeypair = {
    version: KEYPAIR_STORAGE_VERSION,
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(KEYPAIR_STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

/** Load keypair from localStorage. Returns null if absent or invalid. */
export function loadKeypair(): StoredKeypair | null {
  const raw = localStorage.getItem(KEYPAIR_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredKeypair;
    if (parsed.version !== KEYPAIR_STORAGE_VERSION) return null;
    if (!parsed.privateKey || !parsed.publicKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Sign "agentverse:<nonce>" with the private key. Returns hex signature. */
export function signNonce(nonce: string, privateKeyHex: string): string {
  const message = utf8ToBytes("agentverse:" + nonce);
  const sig = ed25519.sign(message, hexToBytes(privateKeyHex));
  return bytesToHex(sig);
}

/** Remove keypair from localStorage. */
export function clearKeypair(): void {
  localStorage.removeItem(KEYPAIR_STORAGE_KEY);
}

/** Check if a JWT is expired by decoding the payload. */
export function isJwtExpired(jwt: string): boolean {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1])) as { exp?: number };
    if (!payload.exp) return true;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}
