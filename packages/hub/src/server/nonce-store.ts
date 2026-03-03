import { randomBytes } from "node:crypto";
import { AUTH } from "./auth-constants.js";

export class NonceStore {
  private readonly entries = new Map<string, { timer: ReturnType<typeof setTimeout> }>();

  /** Generate a 32-byte (64-char hex) nonce with auto-expiry. */
  generate(): string {
    const nonce = randomBytes(32).toString("hex");
    const timer = setTimeout(() => {
      this.entries.delete(nonce);
    }, AUTH.NONCE_TTL_MS);
    timer.unref();
    this.entries.set(nonce, { timer });
    return nonce;
  }

  /** Consume a nonce (one-time use). Returns true if valid, false otherwise. */
  consume(nonce: string): boolean {
    const entry = this.entries.get(nonce);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.entries.delete(nonce);
    return true;
  }

  /** Number of active nonces. */
  get size(): number {
    return this.entries.size;
  }

  /** Clear all nonces and their timers. */
  destroy(): void {
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timer);
    }
    this.entries.clear();
  }
}
