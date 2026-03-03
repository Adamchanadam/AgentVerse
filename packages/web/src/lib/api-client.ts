class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("agentverse_token");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (secret: string) =>
    apiFetch<{ token: string }>("/api/auth/token", {
      method: "POST",
      body: JSON.stringify({ secret }),
    }),

  getAgents: (params?: { q?: string; page?: number; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.page) sp.set("page", String(params.page));
    if (params?.limit) sp.set("limit", String(params.limit));
    const qs = sp.toString();
    return apiFetch<import("./types").AgentsResponse>(`/api/agents${qs ? `?${qs}` : ""}`);
  },

  getAgent: (id: string) => apiFetch<import("./types").Agent>(`/api/agents/${id}`),

  getPairings: () => apiFetch<import("./types").PairingsResponse>("/api/pairings"),

  createPairing: (agentAId: string, agentBId: string) =>
    apiFetch<{ pairing: import("./types").Pairing }>("/api/pairings", {
      method: "POST",
      body: JSON.stringify({ agentAId, agentBId }),
    }),

  requestPairing: (targetAgentId: string) =>
    apiFetch<{ pairing: import("./types").Pairing }>("/api/pairings", {
      method: "POST",
      body: JSON.stringify({ targetAgentId }),
    }),

  updatePairing: (id: string, action: "approve" | "revoke" | "cancel") =>
    apiFetch<{ pairing: import("./types").Pairing }>(`/api/pairings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),

  getNonce: () => apiFetch<{ nonce: string }>("/api/auth/nonce"),

  bootstrap: (params: {
    pubkey: string;
    signature: string;
    nonce: string;
    display_name?: string;
    persona_tags?: string[];
  }) =>
    apiFetch<import("./types").BootstrapResponse>("/api/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify(params),
    }),
};

export { ApiError };
