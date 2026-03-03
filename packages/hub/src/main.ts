import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { parseEnv } from "./env.js";
import { createDbFromUrl } from "./db/index.js";
import { seedDemoAgents } from "./db/seeders/demo-agents.js";
import { buildApp } from "./server/app.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

async function main() {
  const config = parseEnv();
  const { db, pool } = createDbFromUrl(config.DATABASE_URL);

  // Run pending migrations before starting the server
  const migrationsFolder = path.join(__dirname, "..", "drizzle");
  await migrate(db, { migrationsFolder });

  await seedDemoAgents(db, config.SEED_DEMO);

  const app = buildApp(config, db, { logger: true });
  await app.listen({ port: config.PORT, host: "0.0.0.0" });

  const shutdown = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal: failed to start Hub server", err);
  process.exit(1);
});
