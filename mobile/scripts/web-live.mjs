/**
 * `npm run web:live` — the web preview against a running BandhanTak backend.
 *
 * Sets the three variables the live web preview needs and starts Expo for the
 * web, so the command is the same in cmd, PowerShell and bash:
 *
 *   EXPO_PUBLIC_DATA_MODE=live       real API instead of sample data
 *   EXPO_PUBLIC_WEB_API_PROXY=1      call `/api/*` same-origin …
 *   BANDHANTAK_API_PROXY=<backend>   … which metro.config.js forwards here
 *   EXPO_PUBLIC_API_URL=<backend>    and the website links (pricing, safety,
 *                                    forgot password) open on that same
 *                                    backend, not on bandhantak.com
 *
 * Backend defaults to http://localhost:3000; override with BANDHANTAK_API_PROXY.
 * Extra args pass through: `npm run web:live -- --port 8090`.
 */
import { spawn } from "node:child_process";

const backend = process.env.BANDHANTAK_API_PROXY || "http://localhost:3000";

const env = {
  ...process.env,
  EXPO_PUBLIC_DATA_MODE: "live",
  EXPO_PUBLIC_WEB_API_PROXY: "1",
  BANDHANTAK_API_PROXY: backend,
  // A preview wired to a local backend must not send a tap on "Pricing" to
  // production. Set it explicitly to point the links somewhere else.
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || backend,
};

const child = spawn("npx", ["expo", "start", "--web", ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 0));
