import { createRequire } from "node:module";
import { config as loadEnv } from "dotenv";

/**
 * Env for scripts run outside Next.
 *
 * Import this **first**, before anything that reaches `lib/db/prisma.ts` — that
 * module builds its client at import time and throws without `DATABASE_URL`.
 * Same file order Next itself uses (`.env`, then `.env.local` wins), and the
 * same order `prisma.config.ts` loads them in.
 */
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

/**
 * Make `import "server-only"` resolvable under plain Node.
 *
 * `server-only` is not a real dependency of this project. Next aliases it to
 * `next/dist/compiled/server-only` inside its own bundler, so under `tsx` the
 * bare specifier resolves to nothing and *any* script that transitively reaches
 * a `server-only` module dies at import with MODULE_NOT_FOUND — before a single
 * line of the thing being checked has run.
 *
 * That is the same class of problem this file already exists to solve. It is
 * also, more importantly, a problem worth solving rather than routing around:
 * the alternative is what `intelligenceService.ts` had to do — leave the marker
 * off so scripts can reach it — and that trade only stays acceptable while the
 * number of modules making it is small. `lib/services/grio/*` all carry the
 * marker deliberately, and "delete the boundary so the test can run" is the
 * wrong direction for a boundary that is doing real work.
 *
 * So the marker stays on the modules and the *script runner* learns to resolve
 * it, to Next's own empty shim — byte-for-byte what a React Server Component
 * gets, since the package's `react-server` export condition points at the same
 * empty file. Nothing outside `scripts/` is touched: Next never imports this
 * module, so the client-boundary error it raises in a browser bundle is exactly
 * as loud as it was before.
 */
const req = createRequire(import.meta.url);
const Module = req("node:module") as {
  _resolveFilename: (request: string, ...rest: unknown[]) => string;
};
const shim = req.resolve("next/dist/compiled/server-only/empty.js");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only" || request === "client-only") return shim;
  return resolveFilename.call(this, request, ...rest);
};
