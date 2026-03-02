/**
 * Compact one-line summary formatters for EventEnvelope and WsFrame.
 * Useful for logging and debugging.
 */

import type { EventEnvelope } from "./types.js";
import type { WsFrame } from "./ws-types.js";

/**
 * Return a compact one-line summary of an EventEnvelope.
 */
export function prettyEnvelope(envelope: EventEnvelope): string {
  const shortId = envelope.event_id.slice(0, 8);
  const recipientCount = envelope.recipient_ids.length;
  const recipients =
    recipientCount <= 2
      ? envelope.recipient_ids.join(", ")
      : `${envelope.recipient_ids[0]}, ... (${recipientCount} recipients)`;
  return `[${envelope.event_type}] ${shortId}... -> ${recipients}`;
}

/**
 * Return a compact one-line summary of a WsFrame.
 */
export function prettyFrame(frame: WsFrame): string {
  switch (frame.type) {
    case "submit_event":
      return `[submit_event] ${prettyEnvelope(frame.payload)}`;
    case "event":
      return `[event] seq=${frame.server_seq} ${prettyEnvelope(frame.payload)}`;
    case "submit_result":
      return `[submit_result] ${frame.payload.event_id} ${frame.payload.status}`;
    case "consumer_ack":
      return `[consumer_ack] seq=${frame.payload.server_seq}`;
    case "error":
      return `[error] ${frame.code}: ${frame.message}`;
    case "auth":
      return `[auth] pubkey=${frame.payload.pubkey.slice(0, 8)}...`;
    case "auth_ok":
      return `[auth_ok] agent=${frame.payload.agent_id}`;
    case "auth_error":
      return `[auth_error] ${frame.error}`;
    case "challenge":
      return `[challenge] nonce=${frame.nonce.slice(0, 8)}...`;
    case "catchup_start":
      return `[catchup_start] from=${frame.from_seq}`;
    default:
      return `[${frame.type}]`;
  }
}
