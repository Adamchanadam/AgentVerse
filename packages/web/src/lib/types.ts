export interface Agent {
  id: string;
  displayName: string;
  personaTags: string[];
  capabilities: string[];
  level: number;
  visibility: string;
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
