import { describe, it, expect } from "vitest";
import { createDb, createDbFromUrl } from "./index.js";
import { newDb } from "pg-mem";

describe("createDb", () => {
  it("returns a drizzle db instance with query interface", () => {
    const mem = newDb();
    const pg = mem.adapters.createPg();
    const pool = new pg.Pool();
    const db = createDb(pool);

    // drizzle db has select, insert, update, delete methods
    expect(typeof db.select).toBe("function");
    expect(typeof db.insert).toBe("function");
    expect(typeof db.update).toBe("function");
    expect(typeof db.delete).toBe("function");
  });

  it("createDbFromUrl returns an object with db and pool", () => {
    const result = createDbFromUrl("postgres://localhost/test");
    expect(result).toHaveProperty("db");
    expect(result).toHaveProperty("pool");
    expect(typeof result.pool.end).toBe("function");
  });
});
