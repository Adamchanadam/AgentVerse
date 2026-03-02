import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { join } from "path";
import { ServerSeqCursorManager } from "./cursor-manager.js";

type Op = { type: "ack"; seq: string } | { type: "submit_result"; seq: string };

describe("P8: Cursor only advances on consumer_ack", () => {
  it("cursor equals max of ack seqs, ignoring all submit_result seqs", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.bigInt({ min: 1n, max: 10000n }).map(
              (n): Op => ({
                type: "ack" as const,
                seq: n.toString(),
              }),
            ),
            fc.bigInt({ min: 1n, max: 10000n }).map(
              (n): Op => ({
                type: "submit_result" as const,
                seq: n.toString(),
              }),
            ),
          ),
          { minLength: 1, maxLength: 50 },
        ),
        (ops) => {
          const p = join(tmpdir(), `cursor-pbt-${randomUUID()}`, "cursor.dat");
          const cm = new ServerSeqCursorManager(p);

          let expectedMax = 0n;
          for (const op of ops) {
            if (op.type === "ack") {
              cm.ack(op.seq);
              const val = BigInt(op.seq);
              if (val > expectedMax) expectedMax = val;
            } else {
              cm.onSubmitResult(op.seq);
            }
          }

          expect(cm.current).toBe(expectedMax.toString());
        },
      ),
      { numRuns: 100 },
    );
  });
});
