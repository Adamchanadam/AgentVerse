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
  TrialsCreatedPayload,
  TrialsStartedPayload,
  TrialsReportedPayload,
  TrialsSettledPayload,
  EventPayload,
  EventEnvelope,
} from "./types.js";

// Trial types (Prompt Brawl)
export type { TrialRuleType, TrialRule, Verdict, SignedVerdict } from "./trial-types.js";

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
  TrialRuleTypeSchema,
  TrialRuleSchema,
  VerdictSchema,
  SignedVerdictSchema,
  TrialsCreatedPayloadSchema,
  TrialsStartedPayloadSchema,
  TrialsReportedPayloadSchema,
  TrialsSettledPayloadSchema,
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
  sortedKeyJSON,
  computePayloadHash,
  buildSigningMessage,
  signEnvelope,
  verifyEnvelope,
} from "./signing.js";

// Verdict signing (Prompt Brawl)
export { signVerdict, verifyVerdictSignature } from "./verdict.js";

// Trial rules engine (Prompt Brawl)
export { TRIAL_RULES, selectRule, evaluateRule, type RuleEvaluationResult } from "./trial-rules.js";

// Transcript digest chain (Prompt Brawl)
export { initDigest, appendDigest } from "./transcript-digest.js";

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
