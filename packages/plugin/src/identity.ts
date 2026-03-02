/**
 * IdentityManager — Ed25519 keypair lifecycle for the AgentVerse plugin.
 *
 * Spec: PROJECT_MASTER_SPEC.md §4.1
 * - Default storage: ~/.openclaw/agentverse/identity.key (separate from OpenClaw device identity)
 * - Algorithm: Ed25519 (@noble/curves/ed25519)
 * - Private key NEVER transmitted or returned in any public method
 * - File permissions: 0o600 (owner read/write only)
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

const DEFAULT_STORAGE_PATH = join(homedir(), ".openclaw", "agentverse", "identity.key");

interface StoredKeypair {
  privateKey: string; // hex-encoded 32-byte Ed25519 seed
  publicKey: string; // hex-encoded 32-byte Ed25519 public key
}

export class IdentityManager {
  private readonly storagePath: string;
  private keypair: { privateKey: Uint8Array; publicKey: Uint8Array } | null = null;

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? DEFAULT_STORAGE_PATH;
  }

  /**
   * Ensure a keypair is available in memory.
   * - If already loaded, returns immediately (idempotent).
   * - If a key file exists on disk, loads it.
   * - Otherwise generates a new keypair and saves it to disk.
   */
  ensureKeypair(): void {
    if (this.keypair !== null) return;
    if (existsSync(this.storagePath)) {
      this.loadFromDisk();
    } else {
      this.generateAndSave();
    }
  }

  /**
   * Return the Ed25519 public key as a Uint8Array (32 bytes).
   * Calls ensureKeypair() automatically.
   */
  getPublicKey(): Uint8Array {
    this.ensureKeypair();
    return this.keypair!.publicKey;
  }

  /**
   * Return the Ed25519 public key as a lowercase hex string (64 chars).
   */
  getPublicKeyHex(): string {
    return bytesToHex(this.getPublicKey());
  }

  /**
   * Sign arbitrary data with the Ed25519 private key.
   * Returns hex-encoded 64-byte signature.
   *
   * The private key is never returned or logged.
   */
  sign(data: Uint8Array): string {
    this.ensureKeypair();
    const sig = ed25519.sign(data, this.keypair!.privateKey);
    return bytesToHex(sig);
  }

  /**
   * Rotate the keypair: generates a fresh Ed25519 keypair, saves it to disk,
   * and replaces the in-memory keypair. The old keypair is discarded.
   *
   * Any existing sessions authenticated with the old keypair will be invalid.
   */
  rotateKeypair(): void {
    this.keypair = null;
    this.generateAndSave();
  }

  // ─── Private ─────────────────────────────────────────────────

  private loadFromDisk(): void {
    const raw = readFileSync(this.storagePath, "utf-8");
    const stored = JSON.parse(raw) as StoredKeypair;
    this.keypair = {
      privateKey: hexToBytes(stored.privateKey),
      publicKey: hexToBytes(stored.publicKey),
    };
  }

  private generateAndSave(): void {
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = ed25519.getPublicKey(privateKey);
    this.keypair = { privateKey, publicKey };
    this.saveToDisk();
  }

  private saveToDisk(): void {
    const dir = dirname(this.storagePath);
    mkdirSync(dir, { recursive: true });
    const stored: StoredKeypair = {
      privateKey: bytesToHex(this.keypair!.privateKey),
      publicKey: bytesToHex(this.keypair!.publicKey),
    };
    writeFileSync(this.storagePath, JSON.stringify(stored, null, 2), {
      mode: 0o600,
    });
  }
}
