// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const http = require("node:http");
const https = require("node:https");

const config = getDefaultConfig(__dirname);

/**
 * Web preview only — a same-origin door to the BandhanTak backend.
 *
 * On a phone the app calls the API directly (`EXPO_PUBLIC_API_URL`); a native
 * client has no CORS. A browser tab opened on this dev server does, and the
 * Next app grants none. So when `BANDHANTAK_API_PROXY` is set (see
 * `scripts/web-live.mjs`), this dev server forwards `/api/*` and uploaded
 * photos to that backend and the web build calls them same-origin. Nothing
 * here ships in an app build: Metro's middleware only exists while
 * `expo start` runs.
 */
const target = process.env.BANDHANTAK_API_PROXY;
if (target) {
  const upstream = new URL(target);
  const client = upstream.protocol === "https:" ? https : http;
  const forwarded = ["/api/", "/uploads/"];
  const previous = config.server.enhanceMiddleware;

  config.server.enhanceMiddleware = (middleware, server) => {
    const inner = previous ? previous(middleware, server) : middleware;
    return (req, res, next) => {
      if (!req.url || !forwarded.some((prefix) => req.url.startsWith(prefix))) {
        return inner(req, res, next);
      }
      const proxied = client.request(
        {
          protocol: upstream.protocol,
          hostname: upstream.hostname,
          port: upstream.port,
          method: req.method,
          path: req.url,
          headers: { ...req.headers, host: upstream.host },
        },
        (reply) => {
          res.writeHead(reply.statusCode ?? 502, reply.headers);
          reply.pipe(res);
        },
      );
      proxied.on("error", (err) => {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "PROXY_FAILED", message: err.message }));
      });
      req.pipe(proxied);
    };
  };
}

module.exports = config;
