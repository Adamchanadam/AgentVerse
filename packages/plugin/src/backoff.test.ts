import { describe, it, expect } from "vitest";
import { calculateBackoff } from "./backoff.js";

const noJitter = () => 0;

describe("calculateBackoff", () => {
  it("attempt 1 → 1000ms", () => {
    expect(calculateBackoff(1, noJitter)).toBe(1000);
  });
  it("attempt 2 → 2000ms", () => {
    expect(calculateBackoff(2, noJitter)).toBe(2000);
  });
  it("attempt 3 → 4000ms", () => {
    expect(calculateBackoff(3, noJitter)).toBe(4000);
  });
  it("attempt 6 → 32000ms", () => {
    expect(calculateBackoff(6, noJitter)).toBe(32000);
  });
  it("attempt 7 → capped at 60000ms", () => {
    expect(calculateBackoff(7, noJitter)).toBe(60000);
  });
  it("attempt 100 → still capped at 60000ms", () => {
    expect(calculateBackoff(100, noJitter)).toBe(60000);
  });
  it("default jitter is non-negative additive", () => {
    const delay = calculateBackoff(1);
    expect(delay).toBeGreaterThanOrEqual(1000);
  });
});
