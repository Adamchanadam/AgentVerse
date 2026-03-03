/**
 * AgentVerse ChannelPlugin object for OpenClaw integration.
 *
 * Satisfies the OpenClaw ChannelPlugin interface with:
 * - id: "agentverse"
 * - meta: label/blurb/aliases/selectionLabel/docsPath
 * - capabilities: { chatTypes: ["direct"] }
 * - config: listAccountIds + resolveAccount
 * - outbound: deliveryMode "direct", sendText via WS msg.relay frame
 * - status: probeAccount returns connection state + lastSeq
 *
 * Spec: tasks.md 16.2b
 */

import type { WsFrame } from "@agentverse/shared";
import type { ChannelPlugin, OpenClawConfig } from "./openclaw-types.js";
import type { WebSocketConnectionManager } from "./ws-connection-manager.js";
import type { ServerSeqCursorManager } from "./cursor-manager.js";
import type { IdentityManager } from "./identity.js";
import { buildSignedEnvelope } from "./envelope-builder.js";

export function buildChannelPlugin(
  ws: WebSocketConnectionManager,
  cursor: ServerSeqCursorManager,
  identity: IdentityManager,
): ChannelPlugin {
  return {
    id: "agentverse",

    meta: {
      id: "agentverse",
      label: "AgentVerse",
      selectionLabel: "AgentVerse Hub",
      docsPath: "channels/agentverse",
      blurb: "Agent social network + gamified growth + DNA exchange",
      aliases: ["av"],
    },

    capabilities: { chatTypes: ["direct"] },

    config: {
      listAccountIds(cfg: OpenClawConfig): string[] {
        const accounts = cfg.channels?.agentverse?.accounts;
        if (accounts && typeof accounts === "object") {
          return Object.keys(accounts);
        }
        return ["default"];
      },

      resolveAccount(cfg: OpenClawConfig, accountId?: string | null) {
        const accounts = cfg.channels?.agentverse?.accounts;
        if (accounts && typeof accounts === "object") {
          const key = accountId ?? "default";
          return (accounts as Record<string, unknown>)[key] ?? { id: key };
        }
        return { id: accountId ?? "default" };
      },
    },

    outbound: {
      deliveryMode: "direct",

      async sendText(ctx) {
        // Build a signed msg.relay envelope.
        // Note: For full E2E encryption, the caller (OpenClaw Gateway) would
        // provide encrypted ciphertext. Here we wrap ctx.text as a simplified
        // MsgRelayPayload for the MVP outbound path.
        const envelope = buildSignedEnvelope(identity, {
          eventType: "msg.relay",
          payload: {
            pair_id: ctx.to,
            ciphertext: ctx.text,
            ephemeral_pubkey: "",
          },
          recipientIds: [ctx.to],
        });
        const frame: WsFrame = { type: "submit_event", payload: envelope };
        ws.send(frame);
        return { ok: true };
      },
    },

    status: {
      async probeAccount() {
        return {
          connected: ws.state === "connected",
          lastSeq: cursor.current,
        };
      },
    },
  };
}
