/**
 * Structural payload validator for WebSocket event submissions.
 *
 * Uses a whitelist/structural-checking approach:
 * - Defines allowed fields per event_type
 * - Rejects extra fields not in whitelist
 * - Enforces string length limits
 * - Rejects path separators in unexpected fields
 */

import type { EventType } from "@agentverse/shared";

// ─── Constants ──────────────────────────────────────────────

/** Maximum length for ordinary text/string fields. */
export const MAX_STRING_LEN = 200;

/** Maximum length for the ciphertext field (base64 encoded). */
export const MAX_CIPHERTEXT_LEN = 65_536;

/** Path separator pattern disallowed in metadata string fields. */
export const PATH_SEPARATOR_RE = /[/\\]/;

// ─── Result type ────────────────────────────────────────────

export type PolicyResult = { ok: true } | { ok: false; error: string };

// ─── Field definitions per event type ───────────────────────

interface FieldPolicy {
  allowed: ReadonlySet<string>;
  required: ReadonlySet<string>;
}

const AGENT_CARD_FIELDS: FieldPolicy = {
  allowed: new Set(["display_name", "persona_tags", "capabilities", "visibility"]),
  required: new Set(["display_name", "persona_tags", "capabilities", "visibility"]),
};

const PAIR_REQUESTED_FIELDS: FieldPolicy = {
  allowed: new Set(["target_agent_id", "message"]),
  required: new Set(["target_agent_id"]),
};

const PAIR_APPROVED_FIELDS: FieldPolicy = {
  allowed: new Set(["pair_id", "requester_agent_id"]),
  required: new Set(["pair_id", "requester_agent_id"]),
};

const PAIR_REVOKED_FIELDS: FieldPolicy = {
  allowed: new Set(["pair_id", "reason"]),
  required: new Set(["pair_id"]),
};

const MSG_RELAY_FIELDS: FieldPolicy = {
  allowed: new Set(["pair_id", "ciphertext", "ephemeral_pubkey"]),
  required: new Set(["pair_id", "ciphertext", "ephemeral_pubkey"]),
};

const POLICY_MAP: ReadonlyMap<EventType, FieldPolicy> = new Map<EventType, FieldPolicy>([
  ["agent.registered", AGENT_CARD_FIELDS],
  ["agent.updated", AGENT_CARD_FIELDS],
  ["pair.requested", PAIR_REQUESTED_FIELDS],
  ["pair.approved", PAIR_APPROVED_FIELDS],
  ["pair.revoked", PAIR_REVOKED_FIELDS],
  ["msg.relay", MSG_RELAY_FIELDS],
]);

/**
 * Fields exempt from path-separator checking (binary/opaque data).
 * These only have length checked against MAX_CIPHERTEXT_LEN.
 */
const PATH_CHECK_EXEMPT = new Set(["ciphertext", "ephemeral_pubkey"]);

// ─── Helpers ────────────────────────────────────────────────

function fail(error: string): PolicyResult {
  return { ok: false, error };
}

function ok(): PolicyResult {
  return { ok: true };
}

/**
 * Validate a single string value against length and path-separator rules.
 * @param field  Field name (for error messages and exemption lookup)
 * @param value  The string value to check
 */
function checkString(field: string, value: string): PolicyResult | null {
  if (PATH_CHECK_EXEMPT.has(field)) {
    // Exempt fields: only check length against the larger limit
    if (value.length > MAX_CIPHERTEXT_LEN) {
      return fail(`Field "${field}" exceeds max ciphertext length (${MAX_CIPHERTEXT_LEN})`);
    }
    return null;
  }

  if (value.length > MAX_STRING_LEN) {
    return fail(`Field "${field}" exceeds max length (${MAX_STRING_LEN})`);
  }

  if (PATH_SEPARATOR_RE.test(value)) {
    return fail(`Field "${field}" contains disallowed path separator`);
  }

  return null;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Validate the structural shape and content of an event payload.
 *
 * This is a "data policy" check — it does NOT verify signatures, envelope
 * fields, or business logic. It ensures the payload contains only whitelisted
 * fields, all required fields are present, and string values conform to length
 * and character restrictions.
 */
export function validatePayload(
  eventType: EventType | string,
  payload: Record<string, unknown>,
): PolicyResult {
  // 1. Reject unknown event types
  const policy = POLICY_MAP.get(eventType as EventType);
  if (!policy) {
    return fail(`Unknown event type: "${eventType}"`);
  }

  // 2. Check required fields
  for (const field of policy.required) {
    if (!(field in payload) || payload[field] === undefined) {
      return fail(`Missing required field "${field}" for event type "${eventType}"`);
    }
  }

  // 3. Reject extra fields not in whitelist
  for (const key of Object.keys(payload)) {
    if (!policy.allowed.has(key)) {
      return fail(`Unexpected field "${key}" for event type "${eventType}"`);
    }
  }

  // 4. Check string fields and array items
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") {
      const err = checkString(key, value);
      if (err) return err;
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === "string") {
          const err = checkString(`${key}[${i}]`, item);
          if (err) return err;
        }
        // Objects in arrays (e.g. capabilities) — check nested string fields
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          for (const [nestedKey, nestedVal] of Object.entries(item as Record<string, unknown>)) {
            if (typeof nestedVal === "string") {
              const err = checkString(`${key}[${i}].${nestedKey}`, nestedVal);
              if (err) return err;
            }
          }
        }
      }
    }
  }

  return ok();
}
