// @agentverse/shared — Zod schemas for Event Envelope & WsFrame validation
// Validates: Requirements 4.1, 25.1, 25.2, 25.3, 25.4

import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation result types (Zod-version-agnostic)
// ---------------------------------------------------------------------------

export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export interface ValidationFailure {
  success: false;
  issues: ValidationIssue[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

// ---------------------------------------------------------------------------
// Event Type Schema
// ---------------------------------------------------------------------------

export const EventTypeSchema = z.enum([
  "agent.registered",
  "agent.updated",
  "pair.requested",
  "pair.approved",
  "pair.revoked",
  "msg.relay",
]);

// ---------------------------------------------------------------------------
// Payload Schemas
// ---------------------------------------------------------------------------

export const CapabilitySchema = z.object({
  name: z.string(),
  version: z.string(),
});

export const AgentCardPayloadSchema = z.object({
  display_name: z.string(),
  persona_tags: z.array(z.string()),
  capabilities: z.array(CapabilitySchema),
  visibility: z.enum(["public", "paired_only", "private"]),
});

export const PairRequestedPayloadSchema = z.object({
  target_agent_id: z.string(),
  message: z.string().optional(),
});

export const PairApprovedPayloadSchema = z.object({
  pair_id: z.string(),
  requester_agent_id: z.string(),
});

export const PairRevokedPayloadSchema = z.object({
  pair_id: z.string(),
  reason: z.string().optional(),
});

export const MsgRelayPayloadSchema = z.object({
  pair_id: z.string(),
  ciphertext: z.string(),
  ephemeral_pubkey: z.string(),
});

export const EventPayloadSchema = z.union([
  AgentCardPayloadSchema,
  PairRequestedPayloadSchema,
  PairApprovedPayloadSchema,
  PairRevokedPayloadSchema,
  MsgRelayPayloadSchema,
]);

// ---------------------------------------------------------------------------
// Event Envelope Schema
// ---------------------------------------------------------------------------

export const EventEnvelopeSchema = z.object({
  event_id: z.string(),
  event_type: EventTypeSchema,
  ts: z.string(),
  sender_pubkey: z.string(),
  recipient_ids: z.array(z.string()),
  nonce: z.string(),
  sig: z.string(),
  // Payload validated separately by event_type in validateEventEnvelope / deserializeEnvelope
  payload: z.record(z.string(), z.unknown()),
});

// Payload schema lookup by event_type (strict validation)
export const payloadSchemaByType = {
  "agent.registered": AgentCardPayloadSchema,
  "agent.updated": AgentCardPayloadSchema,
  "pair.requested": PairRequestedPayloadSchema,
  "pair.approved": PairApprovedPayloadSchema,
  "pair.revoked": PairRevokedPayloadSchema,
  "msg.relay": MsgRelayPayloadSchema,
} as const;

type EventTypeKey = keyof typeof payloadSchemaByType;

interface ZodIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Validate an EventEnvelope with strict payload-type alignment.
 * Returns descriptive errors with field paths on failure (Property 21).
 */
export function validateEventEnvelope(
  input: unknown,
): ValidationResult<z.infer<typeof EventEnvelopeSchema>> {
  const base = EventEnvelopeSchema.safeParse(input);
  if (!base.success) {
    return {
      success: false,
      issues: (base.error.issues as ZodIssue[]).map((i) => ({
        path: i.path,
        message: i.message,
      })),
    };
  }

  const eventType = base.data.event_type as EventTypeKey;
  const payloadSchema = payloadSchemaByType[eventType];
  const payloadResult = payloadSchema.safeParse(base.data.payload);
  if (!payloadResult.success) {
    return {
      success: false,
      issues: (payloadResult.error.issues as ZodIssue[]).map((i) => ({
        path: ["payload", ...i.path],
        message: i.message,
      })),
    };
  }

  return { success: true, data: base.data };
}

// ---------------------------------------------------------------------------
// WsFrame Schemas
// ---------------------------------------------------------------------------

export const AuthPayloadSchema = z.object({
  pubkey: z.string(),
  sig: z.string(),
  last_seen_server_seq: z.string().optional(),
});

export const AuthOkPayloadSchema = z.object({
  agent_id: z.string(),
  server_time: z.string(),
});

const SubmitResultErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const SubmitResultFrameSchema = z.object({
  server_seq: z.string().optional(),
  event_id: z.string(),
  result_ts: z.string(),
  status: z.enum(["accepted", "rejected"]),
  error: SubmitResultErrorSchema.optional(),
});

export const ConsumerAckFrameSchema = z.object({
  server_seq: z.string(),
  event_id: z.string(),
});

export const WsFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("challenge"), nonce: z.string() }),
  z.object({ type: z.literal("auth"), payload: AuthPayloadSchema }),
  z.object({ type: z.literal("auth_ok"), payload: AuthOkPayloadSchema }),
  z.object({ type: z.literal("auth_error"), error: z.string() }),
  z.object({ type: z.literal("submit_event"), payload: EventEnvelopeSchema }),
  z.object({
    type: z.literal("event"),
    payload: EventEnvelopeSchema,
    server_seq: z.string(),
  }),
  z.object({ type: z.literal("submit_result"), payload: SubmitResultFrameSchema }),
  z.object({ type: z.literal("consumer_ack"), payload: ConsumerAckFrameSchema }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
  z.object({ type: z.literal("catchup_start"), from_seq: z.string() }),
  z.object({ type: z.literal("catchup_end") }),
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pong") }),
]);

/**
 * Validate a WsFrame.
 */
export function validateWsFrame(input: unknown): ValidationResult<z.infer<typeof WsFrameSchema>> {
  const result = WsFrameSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    issues: (result.error.issues as ZodIssue[]).map((i) => ({
      path: i.path,
      message: i.message,
    })),
  };
}
