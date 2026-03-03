/**
 * OpenClaw type stubs -- minimal subset for AgentVerse plugin integration.
 * Source of truth: openclaw-main/src/plugins/types.ts + channels/plugins/types.*.ts
 * These are NOT full copies -- only the fields AgentVerse actually uses.
 *
 * When OpenClaw publishes an official plugin-sdk npm package, replace this file.
 */

// --- Plugin API ---

export interface OpenClawPluginApi {
  id: string;
  name: string;
  config: OpenClawConfig;
  pluginConfig?: Record<string, unknown>;
  logger: PluginLogger;
  registerChannel: (reg: { plugin: ChannelPlugin }) => void;
  registerTool: (tool: AgentTool) => void;
  registerCli: (registrar: CliRegistrar, opts?: { commands?: string[] }) => void;
  registerCommand: (cmd: PluginCommand) => void;
  on: (
    hook: string,
    handler: (...args: unknown[]) => Promise<void>,
    opts?: { priority?: number },
  ) => void;
}

export interface PluginLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

// --- Channel Plugin ---

export interface ChannelPlugin {
  id: string;
  meta: ChannelMeta;
  capabilities: { chatTypes: string[] };
  config: ChannelConfigAdapter;
  outbound?: ChannelOutboundAdapter;
  messaging?: ChannelMessagingAdapter;
  status?: ChannelStatusAdapter;
}

export interface ChannelMeta {
  id: string;
  label: string;
  selectionLabel: string;
  docsPath: string;
  blurb: string;
  aliases?: string[];
}

export interface ChannelConfigAdapter {
  listAccountIds: (cfg: OpenClawConfig) => string[];
  resolveAccount: (cfg: OpenClawConfig, accountId?: string | null) => unknown;
}

export interface ChannelOutboundAdapter {
  deliveryMode: "direct" | "gateway" | "hybrid";
  sendText?: (ctx: OutboundContext) => Promise<{ ok: boolean }>;
}

export interface ChannelMessagingAdapter {
  normalizeTarget?: (raw: string) => string | undefined;
}

export interface ChannelStatusAdapter {
  probeAccount?: (...args: unknown[]) => Promise<unknown>;
}

export interface OutboundContext {
  cfg: OpenClawConfig;
  to: string;
  text: string;
  accountId?: string | null;
}

// --- Tool ---

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    id: string,
    params: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

// --- CLI ---

export interface CliContext {
  program: {
    command: (name: string) => {
      description: (desc: string) => {
        action: (fn: (...args: unknown[]) => void | Promise<void>) => unknown;
      };
    };
  };
  config: OpenClawConfig;
  logger: PluginLogger;
}

export type CliRegistrar = (ctx: CliContext) => void | Promise<void>;

// --- Command ---

export interface PluginCommand {
  name: string;
  description: string;
  handler: (ctx: unknown) => Promise<{ text: string }>;
}

// --- Config ---

export interface OpenClawAgentConfig {
  id: string;
  tools?: {
    deny?: string[];
  };
}

export interface OpenClawConfig {
  agents?: {
    list?: OpenClawAgentConfig[];
  };
  channels?: Record<string, { accounts?: Record<string, unknown> }>;
  [key: string]: unknown;
}
