/**
 * Unit tests for IdentityManager (packages/plugin/src/identity.ts)
 *
 * Tests use a temp directory to avoid polluting ~/.openclaw/agentverse/.
 * All paths are isolated per test via unique subdirectories.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

import { describe, it, expect, afterAll } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { existsSync, rmSync, readFileSync } from "fs";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { IdentityManager } from "./identity.js";

// ─── Test Helpers ───────────────────────────────────────────────

const TEST_BASE_DIR = join(tmpdir(), "agentverse-identity-test");

function tmpPath(): string {
  return join(TEST_BASE_DIR, randomUUID(), "identity.key");
}

afterAll(() => {
  // Clean up all temp files created during tests
  if (existsSync(TEST_BASE_DIR)) {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
  }
});

// ─── Constructor & Storage ──────────────────────────────────────

describe("IdentityManager — storage", () => {
  it("uses a custom storagePath when provided", () => {
    const p = tmpPath();
    const mgr = new IdentityManager(p);
    mgr.ensureKeypair();
    expect(existsSync(p)).toBe(true);
  });

  it("creates parent directories if they don't exist", () => {
    const p = tmpPath();
    const mgr = new IdentityManager(p);
    mgr.ensureKeypair();
    expect(existsSync(p)).toBe(true);
  });

  it("persists keypair to disk as JSON with privateKey + publicKey fields", () => {
    const p = tmpPath();
    const mgr = new IdentityManager(p);
    mgr.ensureKeypair();
    const raw = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
    expect(typeof raw.privateKey).toBe("string");
    expect(typeof raw.publicKey).toBe("string");
    // Both are 64-char hex (32-byte keys)
    expect(raw.privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(raw.publicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("loads existing keypair from disk on second ensureKeypair()", () => {
    const p = tmpPath();
    const mgr1 = new IdentityManager(p);
    mgr1.ensureKeypair();
    const pub1 = mgr1.getPublicKeyHex();

    // Second instance loads from same file
    const mgr2 = new IdentityManager(p);
    mgr2.ensureKeypair();
    expect(mgr2.getPublicKeyHex()).toBe(pub1);
  });

  it("ensureKeypair() is idempotent (multiple calls don't regenerate)", () => {
    const p = tmpPath();
    const mgr = new IdentityManager(p);
    mgr.ensureKeypair();
    const pub1 = mgr.getPublicKeyHex();
    mgr.ensureKeypair();
    expect(mgr.getPublicKeyHex()).toBe(pub1);
  });
});

// ─── Public Key ─────────────────────────────────────────────────

describe("IdentityManager — getPublicKey / getPublicKeyHex", () => {
  it("getPublicKeyHex returns a 64-char lowercase hex string", () => {
    const mgr = new IdentityManager(tmpPath());
    expect(mgr.getPublicKeyHex()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("getPublicKey returns a 32-byte Uint8Array", () => {
    const mgr = new IdentityManager(tmpPath());
    const pub = mgr.getPublicKey();
    expect(pub).toBeInstanceOf(Uint8Array);
    expect(pub.byteLength).toBe(32);
  });

  it("getPublicKey and getPublicKeyHex are consistent", () => {
    const mgr = new IdentityManager(tmpPath());
    expect(bytesToHex(mgr.getPublicKey())).toBe(mgr.getPublicKeyHex());
  });

  it("each IdentityManager instance gets a unique keypair", () => {
    const mgr1 = new IdentityManager(tmpPath());
    const mgr2 = new IdentityManager(tmpPath());
    // Different paths → independently generated keypairs → different pubkeys
    expect(mgr1.getPublicKeyHex()).not.toBe(mgr2.getPublicKeyHex());
  });
});

// ─── Signing ────────────────────────────────────────────────────

describe("IdentityManager — sign()", () => {
  it("returns a 128-char hex string (64-byte Ed25519 signature)", () => {
    const mgr = new IdentityManager(tmpPath());
    const sig = mgr.sign(new Uint8Array([1, 2, 3, 4]));
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
  });

  it("signature verifies with Ed25519 using the manager's own public key", () => {
    const mgr = new IdentityManager(tmpPath());
    const data = new TextEncoder().encode("hello agentverse");
    const sigHex = mgr.sign(data);
    const sig = hexToBytes(sigHex);
    const pubkey = mgr.getPublicKey();
    expect(ed25519.verify(sig, data, pubkey)).toBe(true);
  });

  it("signature does NOT verify with a different public key", () => {
    const mgr1 = new IdentityManager(tmpPath());
    const mgr2 = new IdentityManager(tmpPath());
    const data = new TextEncoder().encode("some data");
    const sigHex = mgr1.sign(data);
    const sig = hexToBytes(sigHex);
    // Verify with mgr2's pubkey → should fail
    expect(ed25519.verify(sig, data, mgr2.getPublicKey())).toBe(false);
  });

  it("different data produces different signatures", () => {
    const mgr = new IdentityManager(tmpPath());
    const sig1 = mgr.sign(new TextEncoder().encode("data1"));
    const sig2 = mgr.sign(new TextEncoder().encode("data2"));
    expect(sig1).not.toBe(sig2);
  });
});

// ─── Rotation ───────────────────────────────────────────────────

describe("IdentityManager — rotateKeypair()", () => {
  it("generates a new keypair (different public key)", () => {
    const p = tmpPath();
    const mgr = new IdentityManager(p);
    const pubBefore = mgr.getPublicKeyHex();
    mgr.rotateKeypair();
    expect(mgr.getPublicKeyHex()).not.toBe(pubBefore);
  });

  it("persists rotated keypair to disk", () => {
    const p = tmpPath();
    const mgr = new IdentityManager(p);
    mgr.ensureKeypair();
    mgr.rotateKeypair();
    const newPub = mgr.getPublicKeyHex();

    // Fresh instance loads rotated keypair
    const mgr2 = new IdentityManager(p);
    expect(mgr2.getPublicKeyHex()).toBe(newPub);
  });

  it("old signatures are rejected after rotation", () => {
    const mgr = new IdentityManager(tmpPath());
    const data = new TextEncoder().encode("message before rotation");
    const sigBeforeHex = mgr.sign(data);
    const sigBefore = hexToBytes(sigBeforeHex);

    mgr.rotateKeypair();
    const newPubkey = mgr.getPublicKey();

    // Old signature + new pubkey → invalid
    expect(ed25519.verify(sigBefore, data, newPubkey)).toBe(false);
  });
});

// ─── Private Key Isolation ──────────────────────────────────────

describe("IdentityManager — private key isolation", () => {
  it("getPublicKey does not expose private key bytes", () => {
    const p = tmpPath();
    const mgr = new IdentityManager(p);
    const pub = mgr.getPublicKey();
    // Read the stored file to get the private key bytes
    const stored = JSON.parse(readFileSync(p, "utf-8")) as { privateKey: string };
    const privBytes = hexToBytes(stored.privateKey);
    // Public key bytes must NOT equal private key bytes
    expect(pub).not.toEqual(privBytes);
  });

  it("sign() return value does not contain private key hex", () => {
    const p = tmpPath();
    const mgr = new IdentityManager(p);
    // sign() triggers ensureKeypair() which creates the file
    const sigHex = mgr.sign(new TextEncoder().encode("test"));
    const stored = JSON.parse(readFileSync(p, "utf-8")) as { privateKey: string };
    // Signature hex must not contain private key hex as substring
    expect(sigHex.includes(stored.privateKey)).toBe(false);
  });
});
