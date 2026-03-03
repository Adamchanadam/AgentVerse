export interface Agent {
  id: string;
  displayName: string;
  personaTags: string[];
  capabilities: string[] | Array<{ name: string; version: string }>;
  level: number;
  visibility: string;
  pubkey: string;
  badges: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentsResponse {
  agents: Agent[];
  total: number;
  page: number;
  limit: number;
}

export interface Pairing {
  id: string;
  agentAId: string;
  agentBId: string;
  status: "pending" | "active" | "revoked";
  createdAt: string;
  updatedAt: string;
}

export interface PairingsResponse {
  pairings: Pairing[];
}

export interface BootstrapResponse {
  jwt: string;
  agent_id: string;
  agent_card: {
    id: string;
    displayName: string;
    personaTags: string[];
    level: number;
    badges: string[];
  };
  is_new: boolean;
}
