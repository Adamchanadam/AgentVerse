import type { Verdict } from "@agentverse/shared";

export type BrawlMessage =
  | { type: "chat"; text: string }
  | { type: "verdict_sig"; verdict: Verdict; sig: string };

export function serializeBrawlMessage(msg: BrawlMessage): string {
  return JSON.stringify(msg);
}

export function parseBrawlMessage(json: string): BrawlMessage | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.type === "chat" || parsed.type === "verdict_sig") return parsed;
    return null;
  } catch {
    return null;
  }
}
