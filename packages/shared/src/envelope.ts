/**
 * Event Envelope serialization, deserialization, and validation utilities.
 */

import type { EventEnvelope, EventType } from "./types.js";
import { EventEnvelopeSchema, payloadSchemaByType } from "./schema.js";

/** Validation error with field path information (Property 21) */
export class EnvelopeValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = "EnvelopeValidationError";
  }
}

/**
 * Serialize an EventEnvelope to a JSON string.
 * Uses deterministic key ordering (important for signature verification).
 */
export function serializeEnvelope(envelope: EventEnvelope): string {
  return JSON.stringify(envelope, (_key, value) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value as unknown;
  });
}

interface ZodIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Deserialize a JSON string to an EventEnvelope with full validation.
 * Validates both the envelope structure and the payload against its event_type schema.
 *
 * @throws {EnvelopeValidationError} with field paths on validation failure
 */
export function deserializeEnvelope(json: string): EventEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new EnvelopeValidationError("Invalid JSON", [
      { path: "", message: "Failed to parse JSON" },
    ]);
  }

  // Step 1: validate envelope structure
  const envelopeResult = EventEnvelopeSchema.safeParse(raw);
  if (!envelopeResult.success) {
    throw new EnvelopeValidationError(
      "Envelope validation failed",
      (envelopeResult.error.issues as ZodIssue[]).map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    );
  }

  const envelope = envelopeResult.data;

  // Step 2: validate payload against event_type-specific schema
  const eventType = envelope.event_type as EventType;
  const payloadSchema = payloadSchemaByType[eventType];
  if (!payloadSchema) {
    throw new EnvelopeValidationError("Unknown event_type", [
      { path: "event_type", message: `Unknown event type: ${envelope.event_type}` },
    ]);
  }

  const payloadResult = payloadSchema.safeParse(envelope.payload);
  if (!payloadResult.success) {
    throw new EnvelopeValidationError(
      "Payload validation failed",
      (payloadResult.error.issues as ZodIssue[]).map((i) => ({
        path: `payload.${i.path.join(".")}`,
        message: i.message,
      })),
    );
  }

  return { ...envelope, payload: payloadResult.data } as EventEnvelope;
}

/**
 * Validate an EventEnvelope object (already parsed) without serialization.
 * Returns the validated envelope or throws EnvelopeValidationError.
 */
export function validateEnvelope(envelope: unknown): EventEnvelope {
  return deserializeEnvelope(JSON.stringify(envelope));
}
