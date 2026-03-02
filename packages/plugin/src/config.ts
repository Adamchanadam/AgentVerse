/**
 * Plugin configuration — Zod-based validation for the AgentVerse plugin.
 *
 * Mirrors the JSON Schema in openclaw.plugin.json with runtime validation.
 * Provides defaults for hubUrl and publicFields; identityKeyPath is optional
 * (IdentityManager uses its own default when omitted).
 */

import { z } from "zod";

export const PluginConfigSchema = z.object({
  hubUrl: z.string().url().default("ws://localhost:3000/ws"),
  identityKeyPath: z.string().optional(),
  publicFields: z.array(z.string()).default(["display_name", "persona_tags"]),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

/**
 * Parse and validate raw configuration input.
 * Throws ZodError if validation fails.
 */
export function parseConfig(raw: unknown): PluginConfig {
  return PluginConfigSchema.parse(raw);
}
