import "./_env";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * A cookie that says INCOMPLETE for an account that has gone ACTIVE.
 *
 * Run: `npx tsx scripts/session-claims-check.ts`
 *
 * 2026-09-26, production: a member logged in on the web while their profile
 * was ready but not live. The login signed a cookie saying INCOMPLETE, the
 * dashboard's own render ran `activateIfReady` and made the row ACTIVE, and a
 * page cannot re-sign a cookie. From then on every tap on the reel went
 * /user/reel → (middleware, cookie) /bolo → (row) /user/dashboard, and the
 * reel never opened until they logged out and back in.
 *
 *   1. Middleware's status bounce carries the page it bounced from as `next`.
 *   2. `sessionClaimsStale` compares the cookie's claims with the row.
 *   3. `/api/auth/session/refresh` re-signs a stale cookie once, revokes the
 *      old session, and goes on to `next` — never to another origin — and
 *      sends a browser with no session to /login.
 *   4. `/bolo` hands a stale cookie to that route instead of sending it home.
 *
 * Section 3 writes one throwaway user to the local database and deletes it;
 * the script refuses to run against anything but localhost.
 */

const req = createRequire(import.meta.url);
const Module = req("node:module") as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const stub = req.resolve("./_stubs/nextHeaders.ts");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "next/headers") return stub;
  return resolveFilename.call(this, request, ...rest);
};

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL ?? "postgresql://missing").hostname;
  if (dbHost !== "localhost" && dbHost !== "127.0.0.1") {
    throw new Error(`refusing to write to ${dbHost} — this check only runs on the local database`);
  }

  const { SignJWT } = await import("jose");
  const { JWT_ALG, SESSION_COOKIE, jwtSecretKey, verifySessionToken } = await import("../lib/auth/jwt");
  const { cookies, resetCookieJar } = await import("./_stubs/nextHeaders");

  const token = (status: "ACTIVE" | "INCOMPLETE", role: "USER" | "PARTNER" = "USER") =>
    new SignJWT({ role, status })
      .setProtectedHeader({ alg: JWT_ALG })
      .setSubject("user-under-test")
      .setJti("session-under-test")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(jwtSecretKey());

  /* ------------------------- 1. middleware bounce ------------------------ */
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("../middleware");
  const hit = async (path: string, cookie?: string) => {
    const res = await middleware(
      new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } } : {}),
    );
    return res.headers.get("location");
  };
  assert.equal(
    await hit("/user/reel", await token("INCOMPLETE")),
    "http://localhost:3000/bolo?next=%2Fuser%2Freel",
    "an INCOMPLETE cookie is bounced to /bolo with the page it wanted",
  );
  assert.equal(await hit("/user/reel", await token("ACTIVE")), null, "an ACTIVE cookie reaches the reel");
  assert.equal(await hit("/user/dashboard", await token("INCOMPLETE")), null, "the dashboard takes both");
  assert.equal(await hit("/user/reel"), "http://localhost:3000/login?next=%2Fuser%2Freel");
  console.log("1. middleware bounce carries next ✓");

  /* ------------------------ 2. sessionClaimsStale ------------------------ */
  const { createSession, sessionClaimsStale } = await import("../lib/auth/session");
  const jar = await cookies();
  resetCookieJar();
  assert.equal(await sessionClaimsStale({ role: "USER", status: "ACTIVE" }), false, "no cookie, nothing stale");
  jar.set(SESSION_COOKIE, await token("INCOMPLETE"));
  assert.equal(await sessionClaimsStale({ role: "USER", status: "ACTIVE" }), true, "status moved on");
  assert.equal(await sessionClaimsStale({ role: "USER", status: "INCOMPLETE" }), false, "status unchanged");
  assert.equal(await sessionClaimsStale({ role: "PARTNER", status: "INCOMPLETE" }), true, "role moved on");
  jar.set(SESSION_COOKIE, "not-a-jwt");
  assert.equal(await sessionClaimsStale({ role: "USER", status: "ACTIVE" }), false, "an unreadable cookie is not stale");
  console.log("2. sessionClaimsStale ✓");

  /* ---------------------- 3. /api/auth/session/refresh ------------------- */
  const { prisma } = await import("../lib/db/prisma");
  const { GET } = await import("../app/api/auth/session/refresh/route");
  const refresh = async (next?: string) => {
    const url = new URL("http://localhost:8080/api/auth/session/refresh");
    if (next !== undefined) url.searchParams.set("next", next);
    const res = await GET(new Request(url));
    assert.equal(res.status, 303);
    return res.headers.get("location");
  };

  const suffix = String(Date.now()).slice(-9);
  const created: string[] = [];
  try {
    const user = await prisma.user.create({
      data: { fullName: "Stale Claims Test", email: `stale-claims+${suffix}@local.test`, role: "USER", status: "INCOMPLETE" },
    });
    created.push(user.id);

    resetCookieJar();
    const first = await createSession({ userId: user.id, role: "USER", status: "INCOMPLETE", rememberMe: true });
    // What the dashboard's render does: the row goes ACTIVE, the cookie cannot follow.
    await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
    assert.equal(await sessionClaimsStale({ role: "USER", status: "ACTIVE" }), true);

    assert.equal(await refresh("/user/reel"), "/user/reel", "relative, and on to the page that was asked for");
    const resigned = await verifySessionToken(jar.get(SESSION_COOKIE)?.value ?? "");
    assert.equal(resigned?.status, "ACTIVE", "the cookie now says what the row says");
    assert.notEqual(resigned?.jti, first.id, "a new session, not the old one re-used");
    const old = await prisma.authSession.findUniqueOrThrow({ where: { id: first.id } });
    assert.ok(old.revokedAt, "the session the stale cookie named is revoked");

    const sessionsAfterHeal = await prisma.authSession.count({ where: { userId: user.id } });
    assert.equal(await refresh("/user/matches"), "/user/matches");
    assert.equal(
      await prisma.authSession.count({ where: { userId: user.id } }),
      sessionsAfterHeal,
      "a cookie that already agrees is left alone",
    );
    assert.equal(await refresh("https://evil.example/steal"), "/user/dashboard", "never another origin");
    assert.equal(await refresh("//evil.example"), "/user/dashboard");
    assert.equal(await refresh(), "/user/dashboard");

    resetCookieJar();
    assert.equal(await refresh("/user/reel"), "/login?next=%2Fuser%2Freel", "no session: log in, then the reel");
    console.log("3. /api/auth/session/refresh ✓");
  } finally {
    for (const id of created) await prisma.user.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  }

  /* ------------------------------ 4. /bolo ------------------------------ */
  // A Server Component, so read rather than rendered: the stale branch must
  // come before the redirect home, and must carry `next`.
  const bolo = readFileSync("app/bolo/page.tsx", "utf8");
  const staleAt = bolo.indexOf("await sessionClaimsStale(user)");
  const homeAt = bolo.indexOf("redirect(await postLoginPathWithNext(user, next))");
  assert.ok(staleAt > 0 && homeAt > staleAt, "/bolo re-signs a stale cookie before sending anyone home");
  assert.ok(
    bolo.includes("`/api/auth/session/refresh?next=${encodeURIComponent(next)}`"),
    "/bolo hands `next` on to the refresh route",
  );
  console.log("4. /bolo stale branch ✓");

  console.log("\nsession-claims-check: all green");
}

main().catch((err) => {
  console.error("session-claims-check FAILED:", err);
  process.exit(1);
});
