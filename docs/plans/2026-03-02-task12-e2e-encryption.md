# E2E Encryption Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the E2E v1 encryption/decryption module for msg.relay messages using X25519 + HKDF-SHA-256 + XChaCha20-Poly1305, plus the MVP-mandatory Property 16 PBT.

**Architecture:** The E2E module lives in `packages/shared/src/e2e.ts` so both Hub (for potential future verification) and Plugin can import it. It uses `libsodium-wrappers` for all cryptographic primitives (X25519 ECDH, HKDF-SHA-256, XChaCha20-Poly1305 AEAD). The module exposes `encryptMessage()` and `decryptMessage()` functions, plus a `generateX25519Keypair()` helper for testing. Ed25519 identity keys are NOT mixed with X25519 ephemeral keys — the caller provides the recipient's X25519 public key (converted from Ed25519 if needed) and the sender's X25519 private key for decryption.

**Tech Stack:** libsodium-wrappers (WASM crypto), Vitest + fast-check (PBT), TypeScript

**Key Spec References:**

- `design.md` §3a: E2E v1 加密規格
- `PROJECT_MASTER_SPEC.md` §4.2: E2E 加密（msg.relay）
- `requirements.md` 需求 8: E2E 加密訊息與盲轉送
- `tasks.md` Task 12.1 + 12.2

**Critical Constraint:** Ed25519 (signing) ≠ X25519 (encryption). NEVER mix keypair types. The E2E module works exclusively with X25519 keys. Callers must convert Ed25519 identity keys to X25519 using `crypto_sign_ed25519_pk_to_curve25519` / `crypto_sign_ed25519_sk_to_curve25519` before calling E2E functions.

---

### Task 1: Install libsodium-wrappers dependency

**Files:**

- Modify: `packages/shared/package.json`

**Step 1: Add libsodium-wrappers**

```bash
cd packages/shared && pnpm add libsodium-wrappers@^0.7.15
```

**Step 2: Add @types/libsodium-wrappers**

```bash
cd packages/shared && pnpm add -D @types/libsodium-wrappers@^0.7.14
```

**Step 3: Verify install**

Run: `pnpm typecheck`
Expected: PASS (no new errors)

**Step 4: Commit**

```bash
git add packages/shared/package.json pnpm-lock.yaml
git commit -m "chore: add libsodium-wrappers dependency to @agentverse/shared"
```

---

### Task 2: Write the failing E2E unit tests

**Files:**

- Create: `packages/shared/src/e2e.test.ts`

**Step 1: Write the test file**

The test file covers the core API: `initSodium()`, `generateX25519Keypair()`, `ed25519KeyToX25519()`, `encryptMessage()`, `decryptMessage()`.

```typescript
import { describe, it, expect, beforeAll } from "vitest";

// Will import from e2e.ts once implemented
import {
  initSodium,
  generateX25519Keypair,
  ed25519KeyToX25519,
  encryptMessage,
  decryptMessage,
} from "./e2e.js";

describe("E2E Encryption Module", () => {
  beforeAll(async () => {
    await initSodium();
  });

  describe("initSodium", () => {
    it("initializes libsodium without error", async () => {
      // Should not throw on repeated init
      await expect(initSodium()).resolves.toBeUndefined();
    });
  });

  describe("generateX25519Keypair", () => {
    it("returns keypair with 32-byte public and private keys", () => {
      const kp = generateX25519Keypair();
      expect(kp.publicKey).toBeInstanceOf(Uint8Array);
      expect(kp.privateKey).toBeInstanceOf(Uint8Array);
      expect(kp.publicKey.length).toBe(32);
      expect(kp.privateKey.length).toBe(32);
    });

    it("generates unique keypairs", () => {
      const kp1 = generateX25519Keypair();
      const kp2 = generateX25519Keypair();
      expect(Buffer.from(kp1.publicKey)).not.toEqual(Buffer.from(kp2.publicKey));
    });
  });

  describe("ed25519KeyToX25519", () => {
    it("converts Ed25519 public key to X25519 (32 bytes)", () => {
      // Generate an Ed25519 keypair to test conversion
      const sodium = require("libsodium-wrappers") as typeof import("libsodium-wrappers");
      const edKp = sodium.crypto_sign_keypair();
      const x25519Pub = ed25519KeyToX25519(edKp.publicKey, "public");
      expect(x25519Pub).toBeInstanceOf(Uint8Array);
      expect(x25519Pub.length).toBe(32);
    });

    it("converts Ed25519 secret key to X25519 (32 bytes)", () => {
      const sodium = require("libsodium-wrappers") as typeof import("libsodium-wrappers");
      const edKp = sodium.crypto_sign_keypair();
      const x25519Priv = ed25519KeyToX25519(edKp.privateKey, "private");
      expect(x25519Priv).toBeInstanceOf(Uint8Array);
      expect(x25519Priv.length).toBe(32);
    });
  });

  describe("encryptMessage / decryptMessage round-trip", () => {
    it("encrypts and decrypts a simple message", () => {
      const recipientKp = generateX25519Keypair();
      const plaintext = "Hello, Agent B!";
      const aadParts = {
        event_id: "evt-001",
        pair_id: "pair-abc",
        sender_pubkey: "aa".repeat(32),
      };

      const encrypted = encryptMessage(plaintext, recipientKp.publicKey, aadParts);

      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.ephemeral_pubkey).toBeInstanceOf(Uint8Array);
      expect(encrypted.ephemeral_pubkey.length).toBe(32);

      const decrypted = decryptMessage(
        encrypted.ciphertext,
        encrypted.ephemeral_pubkey,
        recipientKp.privateKey,
        aadParts,
      );

      expect(decrypted).toBe(plaintext);
    });

    it("encrypts and decrypts empty string", () => {
      const recipientKp = generateX25519Keypair();
      const aadParts = {
        event_id: "evt-002",
        pair_id: "pair-xyz",
        sender_pubkey: "bb".repeat(32),
      };

      const encrypted = encryptMessage("", recipientKp.publicKey, aadParts);
      const decrypted = decryptMessage(
        encrypted.ciphertext,
        encrypted.ephemeral_pubkey,
        recipientKp.privateKey,
        aadParts,
      );

      expect(decrypted).toBe("");
    });

    it("encrypts and decrypts unicode message", () => {
      const recipientKp = generateX25519Keypair();
      const plaintext = "你好世界 🌍 مرحبا";
      const aadParts = {
        event_id: "evt-003",
        pair_id: "pair-uni",
        sender_pubkey: "cc".repeat(32),
      };

      const encrypted = encryptMessage(plaintext, recipientKp.publicKey, aadParts);
      const decrypted = decryptMessage(
        encrypted.ciphertext,
        encrypted.ephemeral_pubkey,
        recipientKp.privateKey,
        aadParts,
      );

      expect(decrypted).toBe(plaintext);
    });

    it("fails to decrypt with wrong recipient key", () => {
      const recipientKp = generateX25519Keypair();
      const wrongKp = generateX25519Keypair();
      const aadParts = {
        event_id: "evt-004",
        pair_id: "pair-wrong",
        sender_pubkey: "dd".repeat(32),
      };

      const encrypted = encryptMessage("secret", recipientKp.publicKey, aadParts);

      expect(() =>
        decryptMessage(
          encrypted.ciphertext,
          encrypted.ephemeral_pubkey,
          wrongKp.privateKey,
          aadParts,
        ),
      ).toThrow();
    });

    it("fails to decrypt with tampered AAD (event_id)", () => {
      const recipientKp = generateX25519Keypair();
      const aadParts = {
        event_id: "evt-005",
        pair_id: "pair-aad",
        sender_pubkey: "ee".repeat(32),
      };

      const encrypted = encryptMessage("secret", recipientKp.publicKey, aadParts);

      expect(() =>
        decryptMessage(encrypted.ciphertext, encrypted.ephemeral_pubkey, recipientKp.privateKey, {
          ...aadParts,
          event_id: "evt-TAMPERED",
        }),
      ).toThrow();
    });

    it("fails to decrypt with tampered AAD (pair_id)", () => {
      const recipientKp = generateX25519Keypair();
      const aadParts = {
        event_id: "evt-006",
        pair_id: "pair-original",
        sender_pubkey: "ff".repeat(32),
      };

      const encrypted = encryptMessage("secret", recipientKp.publicKey, aadParts);

      expect(() =>
        decryptMessage(encrypted.ciphertext, encrypted.ephemeral_pubkey, recipientKp.privateKey, {
          ...aadParts,
          pair_id: "pair-TAMPERED",
        }),
      ).toThrow();
    });

    it("fails to decrypt with tampered AAD (sender_pubkey)", () => {
      const recipientKp = generateX25519Keypair();
      const aadParts = {
        event_id: "evt-007",
        pair_id: "pair-spoof",
        sender_pubkey: "11".repeat(32),
      };

      const encrypted = encryptMessage("secret", recipientKp.publicKey, aadParts);

      expect(() =>
        decryptMessage(encrypted.ciphertext, encrypted.ephemeral_pubkey, recipientKp.privateKey, {
          ...aadParts,
          sender_pubkey: "22".repeat(32),
        }),
      ).toThrow();
    });

    it("fails to decrypt with tampered ciphertext", () => {
      const recipientKp = generateX25519Keypair();
      const aadParts = {
        event_id: "evt-008",
        pair_id: "pair-tamper",
        sender_pubkey: "33".repeat(32),
      };

      const encrypted = encryptMessage("secret data", recipientKp.publicKey, aadParts);

      // Flip a byte in the ciphertext
      const tampered = new Uint8Array(encrypted.ciphertext);
      tampered[tampered.length - 1] ^= 0xff;

      expect(() =>
        decryptMessage(tampered, encrypted.ephemeral_pubkey, recipientKp.privateKey, aadParts),
      ).toThrow();
    });

    it("produces different ciphertext for same plaintext (ephemeral keypair)", () => {
      const recipientKp = generateX25519Keypair();
      const aadParts = {
        event_id: "evt-009",
        pair_id: "pair-diff",
        sender_pubkey: "44".repeat(32),
      };

      const enc1 = encryptMessage("same message", recipientKp.publicKey, aadParts);
      const enc2 = encryptMessage("same message", recipientKp.publicKey, aadParts);

      // Different ephemeral keys → different ciphertext
      expect(Buffer.from(enc1.ephemeral_pubkey)).not.toEqual(Buffer.from(enc2.ephemeral_pubkey));
    });
  });

  describe("ciphertext format", () => {
    it("ciphertext contains nonce (24 bytes) prepended", () => {
      const recipientKp = generateX25519Keypair();
      const aadParts = {
        event_id: "evt-010",
        pair_id: "pair-fmt",
        sender_pubkey: "55".repeat(32),
      };

      const encrypted = encryptMessage("test", recipientKp.publicKey, aadParts);

      // ciphertext = nonce(24) + actual_ciphertext + tag(16)
      // "test" is 4 bytes, so total should be 24 + 4 + 16 = 44
      expect(encrypted.ciphertext.length).toBe(24 + 4 + 16);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && npx vitest --run src/e2e.test.ts`
Expected: FAIL (module not found)

**Step 3: Commit**

```bash
git add packages/shared/src/e2e.test.ts
git commit -m "test: add failing E2E encryption unit tests (Task 12)"
```

---

### Task 3: Implement e2e.ts

**Files:**

- Create: `packages/shared/src/e2e.ts`

**Step 1: Write the implementation**

```typescript
/**
 * E2E v1 Encryption Module — X25519 + HKDF-SHA-256 + XChaCha20-Poly1305.
 *
 * Spec: design.md §3a, PROJECT_MASTER_SPEC.md §4.2
 *
 * - ECDH: X25519 (ephemeral per-message keypair)
 * - KDF:  HKDF-SHA-256 (salt = ek_pub ‖ recipient_pub, info = "agentverse-e2e-v1")
 * - AEAD: XChaCha20-Poly1305 (nonce prepended to ciphertext, 24 bytes)
 * - AAD:  event_id ‖ pair_id ‖ sender_pubkey
 *
 * ⚠️ Ed25519 (signing) ≠ X25519 (encryption). NEVER mix keypair types.
 */

import sodium from "libsodium-wrappers";

const KDF_INFO = "agentverse-e2e-v1";

/** AAD components for AEAD binding. */
export interface AadParts {
  event_id: string;
  pair_id: string;
  sender_pubkey: string;
}

/** Encrypted output from encryptMessage(). */
export interface EncryptedMessage {
  /** nonce (24 bytes) ‖ ciphertext ‖ tag (16 bytes) */
  ciphertext: Uint8Array;
  /** X25519 ephemeral public key (32 bytes) */
  ephemeral_pubkey: Uint8Array;
}

/** X25519 keypair. */
export interface X25519Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

let _ready = false;

/**
 * Initialize libsodium. Must be called before any crypto operations.
 * Safe to call multiple times (idempotent).
 */
export async function initSodium(): Promise<void> {
  if (_ready) return;
  await sodium.ready;
  _ready = true;
}

/**
 * Generate a random X25519 keypair (for testing / ephemeral use).
 * initSodium() must have been called first.
 */
export function generateX25519Keypair(): X25519Keypair {
  const kp = sodium.crypto_box_keypair();
  return { publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/**
 * Convert an Ed25519 key to its X25519 equivalent.
 * @param key - Ed25519 public key (32 bytes) or private key (64 bytes seed+pub)
 * @param type - "public" or "private"
 */
export function ed25519KeyToX25519(key: Uint8Array, type: "public" | "private"): Uint8Array {
  if (type === "public") {
    return sodium.crypto_sign_ed25519_pk_to_curve25519(key);
  }
  return sodium.crypto_sign_ed25519_sk_to_curve25519(key);
}

/** Build the AAD bytes: event_id ‖ pair_id ‖ sender_pubkey (UTF-8 concatenation). */
function buildAad(parts: AadParts): Uint8Array {
  const str = parts.event_id + parts.pair_id + parts.sender_pubkey;
  return sodium.from_string(str);
}

/**
 * Derive a 32-byte symmetric key from ECDH shared secret via HKDF-SHA-256.
 *
 * salt = ephemeral_pub (32) ‖ recipient_pub (32) = 64 bytes
 * info = "agentverse-e2e-v1"
 *
 * Uses libsodium's crypto_kdf_hkdf_sha256_expand + extract.
 */
function deriveKey(
  sharedSecret: Uint8Array,
  ephemeralPub: Uint8Array,
  recipientPub: Uint8Array,
): Uint8Array {
  // salt = ek_pub ‖ recipient_pub
  const salt = new Uint8Array(64);
  salt.set(ephemeralPub, 0);
  salt.set(recipientPub, 32);

  // HKDF extract
  const prk = sodium.crypto_kdf_hkdf_sha256_extract(salt, sharedSecret);

  // HKDF expand
  const info = sodium.from_string(KDF_INFO);
  return sodium.crypto_kdf_hkdf_sha256_expand(prk, info, 32);
}

/**
 * Encrypt a plaintext message for a recipient.
 *
 * 1. Generate ephemeral X25519 keypair
 * 2. ECDH with recipient public key
 * 3. HKDF-SHA-256 to derive symmetric key
 * 4. Random 24-byte nonce
 * 5. XChaCha20-Poly1305 encrypt with AAD
 * 6. Return nonce ‖ ciphertext ‖ tag + ephemeral public key
 *
 * @param plaintext - UTF-8 string to encrypt
 * @param recipientPub - Recipient's X25519 public key (32 bytes)
 * @param aadParts - AAD components (event_id, pair_id, sender_pubkey)
 */
export function encryptMessage(
  plaintext: string,
  recipientPub: Uint8Array,
  aadParts: AadParts,
): EncryptedMessage {
  // 1. Ephemeral keypair
  const ephKp = sodium.crypto_box_keypair();

  // 2. ECDH: shared = X25519(ek_priv, recipient_pub)
  const shared = sodium.crypto_scalarmult(ephKp.privateKey, recipientPub);

  // 3. KDF
  const key = deriveKey(shared, ephKp.publicKey, recipientPub);

  // 4. Random nonce (24 bytes for XChaCha20)
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

  // 5. AAD
  const aad = buildAad(aadParts);

  // 6. Encrypt
  const plaintextBytes = sodium.from_string(plaintext);
  const ciphertextOnly = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintextBytes,
    aad,
    null, // nsec (unused)
    nonce,
    key,
  );

  // 7. Prepend nonce: nonce(24) ‖ ciphertext+tag
  const combined = new Uint8Array(nonce.length + ciphertextOnly.length);
  combined.set(nonce, 0);
  combined.set(ciphertextOnly, nonce.length);

  return {
    ciphertext: combined,
    ephemeral_pubkey: ephKp.publicKey,
  };
}

/**
 * Decrypt a message encrypted by encryptMessage().
 *
 * 1. Extract nonce from first 24 bytes of ciphertext
 * 2. ECDH with ephemeral public key using recipient's private key
 * 3. HKDF-SHA-256 to derive symmetric key
 * 4. XChaCha20-Poly1305 decrypt with AAD
 *
 * @param ciphertext - nonce(24) ‖ ciphertext ‖ tag(16) as Uint8Array
 * @param ephemeralPub - Sender's ephemeral X25519 public key (32 bytes)
 * @param recipientPriv - Recipient's X25519 private key (32 bytes)
 * @param aadParts - AAD components (must match sender's)
 * @returns Decrypted plaintext as UTF-8 string
 * @throws Error if decryption fails (wrong key, tampered data, wrong AAD)
 */
export function decryptMessage(
  ciphertext: Uint8Array,
  ephemeralPub: Uint8Array,
  recipientPriv: Uint8Array,
  aadParts: AadParts,
): string {
  const NONCE_LEN = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES; // 24

  if (ciphertext.length < NONCE_LEN + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES) {
    throw new Error("Ciphertext too short");
  }

  // 1. Extract nonce
  const nonce = ciphertext.slice(0, NONCE_LEN);
  const encrypted = ciphertext.slice(NONCE_LEN);

  // 2. ECDH: shared = X25519(recipient_priv, ek_pub)
  const recipientPub = sodium.crypto_scalarmult_base(recipientPriv);
  const shared = sodium.crypto_scalarmult(recipientPriv, ephemeralPub);

  // 3. KDF (same salt = ek_pub ‖ recipient_pub)
  const key = deriveKey(shared, ephemeralPub, recipientPub);

  // 4. AAD
  const aad = buildAad(aadParts);

  // 5. Decrypt
  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, // nsec (unused)
    encrypted,
    aad,
    nonce,
    key,
  );

  return sodium.to_string(plaintext);
}
```

**Step 2: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest --run src/e2e.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add packages/shared/src/e2e.ts
git commit -m "feat: implement E2E v1 encryption module (X25519+HKDF+XChaCha20-Poly1305)"
```

---

### Task 4: Write the failing P16 PBT (E2E Round-Trip)

**Files:**

- Create: `packages/shared/src/e2e.pbt.test.ts`

**Step 1: Write the property-based test**

Property 16 (MVP mandatory): For any random plaintext and valid X25519 keypair, encrypt→decrypt round-trip SHALL restore original content. For any tampered AAD field, decrypt SHALL fail.

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import * as fc from "fast-check";
import {
  initSodium,
  generateX25519Keypair,
  encryptMessage,
  decryptMessage,
  type AadParts,
} from "./e2e.js";

describe("Property 16: E2E Round-Trip (X25519 + HKDF + XChaCha20-Poly1305)", () => {
  beforeAll(async () => {
    await initSodium();
  });

  /** Arbitrary for AAD parts */
  const aadArb = fc.record({
    event_id: fc.uuid(),
    pair_id: fc.uuid(),
    sender_pubkey: fc.hexaString({ minLength: 64, maxLength: 64 }),
  });

  it("encrypt→decrypt round-trip restores original plaintext", () => {
    fc.assert(
      fc.property(fc.string(), aadArb, (plaintext, aad) => {
        const recipientKp = generateX25519Keypair();

        const encrypted = encryptMessage(plaintext, recipientKp.publicKey, aad);
        const decrypted = decryptMessage(
          encrypted.ciphertext,
          encrypted.ephemeral_pubkey,
          recipientKp.privateKey,
          aad,
        );

        expect(decrypted).toBe(plaintext);
      }),
      { numRuns: 100 },
    );
  });

  it("tampered event_id causes decryption failure", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        aadArb,
        fc.uuid(),
        (plaintext, aad, tamperedEventId) => {
          fc.pre(tamperedEventId !== aad.event_id);

          const recipientKp = generateX25519Keypair();
          const encrypted = encryptMessage(plaintext, recipientKp.publicKey, aad);

          expect(() =>
            decryptMessage(
              encrypted.ciphertext,
              encrypted.ephemeral_pubkey,
              recipientKp.privateKey,
              { ...aad, event_id: tamperedEventId },
            ),
          ).toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });

  it("tampered pair_id causes decryption failure", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        aadArb,
        fc.uuid(),
        (plaintext, aad, tamperedPairId) => {
          fc.pre(tamperedPairId !== aad.pair_id);

          const recipientKp = generateX25519Keypair();
          const encrypted = encryptMessage(plaintext, recipientKp.publicKey, aad);

          expect(() =>
            decryptMessage(
              encrypted.ciphertext,
              encrypted.ephemeral_pubkey,
              recipientKp.privateKey,
              { ...aad, pair_id: tamperedPairId },
            ),
          ).toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });

  it("tampered sender_pubkey causes decryption failure", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        aadArb,
        fc.hexaString({ minLength: 64, maxLength: 64 }),
        (plaintext, aad, tamperedPubkey) => {
          fc.pre(tamperedPubkey !== aad.sender_pubkey);

          const recipientKp = generateX25519Keypair();
          const encrypted = encryptMessage(plaintext, recipientKp.publicKey, aad);

          expect(() =>
            decryptMessage(
              encrypted.ciphertext,
              encrypted.ephemeral_pubkey,
              recipientKp.privateKey,
              { ...aad, sender_pubkey: tamperedPubkey },
            ),
          ).toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });

  it("wrong recipient private key causes decryption failure", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), aadArb, (plaintext, aad) => {
        const recipientKp = generateX25519Keypair();
        const wrongKp = generateX25519Keypair();

        const encrypted = encryptMessage(plaintext, recipientKp.publicKey, aad);

        expect(() =>
          decryptMessage(encrypted.ciphertext, encrypted.ephemeral_pubkey, wrongKp.privateKey, aad),
        ).toThrow();
      }),
      { numRuns: 50 },
    );
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd packages/shared && npx vitest --run src/e2e.pbt.test.ts`
Expected: ALL PASS (5 property tests)

**Step 3: Commit**

```bash
git add packages/shared/src/e2e.pbt.test.ts
git commit -m "test: add P16 E2E round-trip PBT (MVP mandatory)"
```

---

### Task 5: Update barrel exports and run full regression

**Files:**

- Modify: `packages/shared/src/index.ts`

**Step 1: Add E2E exports to index.ts**

Add to the end of `packages/shared/src/index.ts`:

```typescript
// E2E encryption (X25519 + HKDF-SHA-256 + XChaCha20-Poly1305)
export {
  initSodium,
  generateX25519Keypair,
  ed25519KeyToX25519,
  encryptMessage,
  decryptMessage,
  type AadParts,
  type EncryptedMessage,
  type X25519Keypair,
} from "./e2e.js";
```

**Step 2: Run full regression**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: ALL PASS

**Step 3: Fix any formatting issues**

Run: `npx prettier --write packages/shared/src/e2e.ts packages/shared/src/e2e.test.ts packages/shared/src/e2e.pbt.test.ts packages/shared/src/index.ts`

**Step 4: Re-run regression if formatting was applied**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/e2e.ts packages/shared/src/e2e.test.ts packages/shared/src/e2e.pbt.test.ts
git commit -m "feat: export E2E module from @agentverse/shared barrel + full regression green"
```

---

### Task 6: Update tasks.md and session docs

**Files:**

- Modify: `.kiro/specs/agentverse/tasks.md` (mark Task 12.1 and 12.2 as [x])
- Modify: `dev/SESSION_HANDOFF.md`
- Modify: `dev/SESSION_LOG.md`

**Step 1: Mark tasks complete in tasks.md**

Update Task 12.1 and 12.2 checkboxes to `[x]` with implementation notes.

**Step 2: Update SESSION_HANDOFF.md**

- Update version line to include E2E encryption
- Update open priorities (Task 13 Checkpoint → Task 14 Web UI)
- Update last session record

**Step 3: Update SESSION_LOG.md**

Record Task 12 completion with:

- Modules created
- Test count
- Verification results

**Step 4: Commit**

```bash
git add .kiro/specs/agentverse/tasks.md dev/SESSION_HANDOFF.md dev/SESSION_LOG.md
git commit -m "docs: mark Task 12 E2E encryption complete"
```

---

## Implementation Notes for Subagent

### libsodium-wrappers API Reference

Key functions needed:

- `sodium.ready` — Promise, must await before use
- `sodium.crypto_box_keypair()` — Generate X25519 keypair
- `sodium.crypto_scalarmult(privateKey, publicKey)` — X25519 ECDH
- `sodium.crypto_scalarmult_base(privateKey)` — Derive X25519 public key from private
- `sodium.crypto_kdf_hkdf_sha256_extract(salt, ikm)` — HKDF extract
- `sodium.crypto_kdf_hkdf_sha256_expand(prk, info, len)` — HKDF expand
- `sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(msg, aad, nsec, nonce, key)` — AEAD encrypt
- `sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(nsec, ciphertext, aad, nonce, key)` — AEAD decrypt
- `sodium.crypto_sign_ed25519_pk_to_curve25519(ed25519Pk)` — Ed25519 pub → X25519 pub
- `sodium.crypto_sign_ed25519_sk_to_curve25519(ed25519Sk)` — Ed25519 priv → X25519 priv
- `sodium.randombytes_buf(len)` — Random bytes
- `sodium.from_string(str)` — UTF-8 string → Uint8Array
- `sodium.to_string(buf)` — Uint8Array → UTF-8 string

### Ciphertext Wire Format

```
ciphertext field = nonce (24 bytes) ‖ encrypted_data ‖ tag (16 bytes)
```

The `crypto_aead_xchacha20poly1305_ietf_encrypt` function returns `encrypted_data ‖ tag` (tag is appended). We manually prepend the nonce for the wire format.

### AAD Construction

AAD = `event_id + pair_id + sender_pubkey` (simple string concatenation, UTF-8 encoded). This binds the ciphertext to the event context and prevents ciphertext relocation attacks.

### Ed25519 → X25519 Key Conversion

The `ed25519KeyToX25519()` helper is provided for callers who need to use Ed25519 identity keys for E2E. The E2E module itself works purely with X25519 keys.

### Constants

- `NPUBBYTES` = 24 (XChaCha20 nonce)
- `ABYTES` = 16 (Poly1305 tag)
- `KEYBYTES` = 32 (symmetric key)
- KDF info = `"agentverse-e2e-v1"`
