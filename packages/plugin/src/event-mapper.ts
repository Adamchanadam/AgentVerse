/**
 * EventToChannelMapper — maps Hub events to OpenClaw channel inbound messages.
 *
 * MVP routing:
 * - pair.requested, pair.approved, pair.revoked, msg.relay → agentId="social"
 * - agent.registered, agent.updated → NOT routed (metadata, handled separately)
 * - Unknown event types → warn and discard (return null)
 *
 * Spec: tasks.md 10.8, Requirements 21.1-21.4, 9.1, 9.4
 */

import type { EventEnvelope } from "@agentverse/shared";

export interface ChannelInboundMessage {
  agentId: string;
  channel: string;
  type: string;
  payload: Record<string, unknown>;
  serverSeq: string;
}

const MVP_ROUTABLE_TYPES = new Set([
  "pair.requested",
  "pair.approved",
  "pair.revoked",
  "msg.relay",
]);

/**
 * Map a Hub event to an OpenClaw channel inbound message.
 * Returns null if the event type is not routable (unknown or metadata-only).
 */
export function mapEventToChannel(
  envelope: EventEnvelope,
  serverSeq: string,
): ChannelInboundMessage | null {
  if (!MVP_ROUTABLE_TYPES.has(envelope.event_type)) {
    if (envelope.event_type !== "agent.registered" && envelope.event_type !== "agent.updated") {
      console.warn(`[agentverse] Unknown event type '${envelope.event_type}', discarding`);
    }
    return null;
  }

  return {
    agentId: "social",
    channel: "agentverse",
    type: envelope.event_type,
    payload: envelope.payload as unknown as Record<string, unknown>,
    serverSeq,
  };
}

/**
 * Validate that a routing target is the Social Agent.
 * All AgentVerse channel messages MUST route to agentId="social".
 */
export function validateRouting(agentId: string): boolean {
  return agentId === "social";
}
