import { describe, it, expect, vi } from "vitest";
import { ConnectionManager } from "./connection-manager.js";
import { WS_READY_STATE, type WebSocketLike } from "./types.js";

/** Create a minimal mock WebSocket. */
function mockSocket(readyState = WS_READY_STATE.OPEN): WebSocketLike {
  return {
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    readyState,
  };
}

describe("ConnectionManager", () => {
  it("adds and retrieves a client by pubkey", () => {
    const mgr = new ConnectionManager();
    const socket = mockSocket();
    mgr.add("pk1", "agent-1", socket);

    const client = mgr.getByPubkey("pk1");
    expect(client).toBeDefined();
    expect(client!.pubkey).toBe("pk1");
    expect(client!.agentId).toBe("agent-1");
    expect(client!.state).toBe("authenticated");
    expect(client!.socket).toBe(socket);
  });

  it("removes a client", () => {
    const mgr = new ConnectionManager();
    mgr.add("pk1", "agent-1", mockSocket());

    expect(mgr.remove("pk1")).toBe(true);
    expect(mgr.getByPubkey("pk1")).toBeUndefined();
    // removing a non-existent key returns false
    expect(mgr.remove("pk1")).toBe(false);
  });

  it("getByAgentId returns the correct client", () => {
    const mgr = new ConnectionManager();
    mgr.add("pk-a", "agent-A", mockSocket());
    mgr.add("pk-b", "agent-B", mockSocket());

    const client = mgr.getByAgentId("agent-B");
    expect(client).toBeDefined();
    expect(client!.pubkey).toBe("pk-b");
    expect(client!.agentId).toBe("agent-B");

    // non-existent agent returns undefined
    expect(mgr.getByAgentId("agent-Z")).toBeUndefined();
  });

  it("returns the connected client count", () => {
    const mgr = new ConnectionManager();
    expect(mgr.size).toBe(0);

    mgr.add("pk1", "agent-1", mockSocket());
    mgr.add("pk2", "agent-2", mockSocket());
    expect(mgr.size).toBe(2);

    mgr.remove("pk1");
    expect(mgr.size).toBe(1);
  });

  it("replaces existing connection when same pubkey reconnects", () => {
    const mgr = new ConnectionManager();
    const oldSocket = mockSocket();
    const newSocket = mockSocket();

    mgr.add("pk1", "agent-1", oldSocket);
    mgr.add("pk1", "agent-1", newSocket);

    // old socket should have been closed with code 4000
    expect(oldSocket.close).toHaveBeenCalledWith(4000, "replaced");

    // map should hold the new socket, not the old one
    const client = mgr.getByPubkey("pk1");
    expect(client!.socket).toBe(newSocket);
    expect(mgr.size).toBe(1);
  });
});
