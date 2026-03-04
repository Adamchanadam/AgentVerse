// @agentverse/shared — public API

// Pure types
export type {
  EventType,
  FutureEventType,
  AgentCardPayload,
  PairRequestedPayload,
  PairApprovedPayload,
  PairRevokedPayload,
  MsgRelayPayload,
  EventPayload,
  EventEnvelope,
} from "./types.js";

export type {
  AuthPayload,
  AuthOkPayload,
  SubmitResultFrame,
  ConsumerAckFrame,
  WsFrame,
} from "./ws-types.js";

// Validation result types
export type {
  ValidationResult,
  ValidationSuccess,
  ValidationFailure,
  ValidationIssue,
} from "./schema.js";

// Zod schemas + validators (runtime validation)
export {
  EventTypeSchema,
  AgentCardPayloadSchema,
  PairRequestedPayloadSchema,
  PairApprovedPayloadSchema,
  PairRevokedPayloadSchema,
  MsgRelayPayloadSchema,
  EventPayloadSchema,
  EventEnvelopeSchema,
  payloadSchemaByType,
  validateEventEnvelope,
  WsFrameSchema,
  validateWsFrame,
  AuthPayloadSchema,
  AuthOkPayloadSchema,
  SubmitResultFrameSchema,
  ConsumerAckFrameSchema,
} from "./schema.js";

// Envelope utilities
export {
  serializeEnvelope,
  deserializeEnvelope,
  validateEnvelope,
  EnvelopeValidationError,
} from "./envelope.js";

// Pretty-printer
export { prettyEnvelope, prettyFrame } from "./pretty.js";

// Event signing (Ed25519)
export {
  computePayloadHash,
  buildSigningMessage,
  signEnvelope,
  verifyEnvelope,
} from "./signing.js";

// E2E encryption (X25519 + HKDF-SHA-256 + XChaCha20-Poly1305)
export {
  generateX25519Keypair,
  ed25519KeyToX25519,
  encryptMessage,
  decryptMessage,
  type AadParts,
  type EncryptedMessage,
  type X25519Keypair,
} from "./e2e.js";
