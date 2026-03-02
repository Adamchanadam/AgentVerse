import type { FastifyInstance } from "fastify";
import staticFiles from "@fastify/static";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// Resolve from src/server/routes/ → packages/hub/public/
// __dirname = packages/hub/src/server/routes/
// go up 3: routes → server → src → hub/ then + /public
const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");

export async function assetsRoute(app: FastifyInstance): Promise<void> {
  await app.register(staticFiles, {
    root: join(PUBLIC_DIR, "assets"),
    prefix: "/api/assets/",
    decorateReply: false, // avoid conflicts when multiple app instances exist (tests)
  });
}
