import { describe, it, expect, beforeEach, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import {
  generateKeypair,
  loadKeypair,
  signNonce,
  clearKeypair,
  isJwtExpired,
  KEYPAIR_STORAGE_KEY,
} from "./crypto.js";

// Minimal localStorage mock
function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

describe("crypto module", () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vi.stubGlobal("localStorage", mockStorage);
  });

  it("generateKeypair() returns valid hex lengths and stores in localStorage", () => {
    const kp = generateKeypair();
    expect(kp.privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.version).toBe(1);
    expect(kp.createdAt).toBeTruthy();
    expect(mockStorage.getItem(KEYPAIR_STORAGE_KEY)).toBeTruthy();
  });

  it("signNonce() produces a verifiable Ed25519 signature", () => {
    const kp = generateKeypair();
    const nonce = "a".repeat(64);
    const sig = signNonce(nonce, kp.privateKey);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);

    const msg = utf8ToBytes("agentverse:" + nonce);
    const valid = ed25519.verify(hexToBytes(sig), msg, hexToBytes(kp.publicKey));
    expect(valid).toBe(true);
  });

  it("loadKeypair() returns null when no data stored", () => {
    expect(loadKeypair()).toBeNull();
  });

  it("loadKeypair() returns stored keypair", () => {
    const kp = generateKeypair();
    const loaded = loadKeypair();
    expect(loaded).toEqual(kp);
  });

  it("clearKeypair() removes data from localStorage", () => {
    generateKeypair();
    expect(loadKeypair()).not.toBeNull();
    clearKeypair();
    expect(loadKeypair()).toBeNull();
  });

  it("isJwtExpired() correctly detects expired and valid tokens", () => {
    // Expired token (exp in the past)
    const pastPayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }));
    const expiredJwt = `eyJ0.${pastPayload}.sig`;
    expect(isJwtExpired(expiredJwt)).toBe(true);

    // Valid token (exp in the future)
    const futurePayload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const validJwt = `eyJ0.${futurePayload}.sig`;
    expect(isJwtExpired(validJwt)).toBe(false);

    // Malformed
    expect(isJwtExpired("not-a-jwt")).toBe(true);
  });
});
