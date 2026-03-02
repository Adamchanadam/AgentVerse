import { describe, it, expect, afterAll } from "vitest";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { join } from "path";
import { rmSync } from "fs";
import { ServerSeqCursorManager } from "./cursor-manager.js";

const TEST_BASE_DIR = join(tmpdir(), "agentverse-cursor-test");

function makeTempPath(): string {
  return join(TEST_BASE_DIR, randomUUID(), "cursor.dat");
}

afterAll(() => {
  try {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

describe("ServerSeqCursorManager", () => {
  it("initial value is '0' when no file exists", () => {
    const cm = new ServerSeqCursorManager(makeTempPath());
    expect(cm.current).toBe("0");
  });

  it("ack() advances cursor forward", () => {
    const cm = new ServerSeqCursorManager(makeTempPath());
    cm.ack("5");
    expect(cm.current).toBe("5");
    cm.ack("10");
    expect(cm.current).toBe("10");
  });

  it("ack() ignores lower/equal seq (monotonic)", () => {
    const cm = new ServerSeqCursorManager(makeTempPath());
    cm.ack("10");
    cm.ack("5");
    expect(cm.current).toBe("10");
    cm.ack("10");
    expect(cm.current).toBe("10");
  });

  it("onSubmitResult() does NOT change cursor", () => {
    const cm = new ServerSeqCursorManager(makeTempPath());
    cm.ack("5");
    cm.onSubmitResult("100");
    expect(cm.current).toBe("5");
  });

  it("persists to disk and reloads correctly", () => {
    const p = makeTempPath();
    const cm1 = new ServerSeqCursorManager(p);
    cm1.ack("42");
    const cm2 = new ServerSeqCursorManager(p);
    expect(cm2.current).toBe("42");
  });
});
