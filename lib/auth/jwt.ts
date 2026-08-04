import { jwtVerify } from "jose";
import type { Role, UserStatus } from "@prisma/client";

// Edge-safe half of session handling — no Prisma, no Node `crypto`, so
// `middleware.ts` can import this directly without pulling the Prisma Client
// runtime into an Edge bundle (it isn't built for that and fails to load
// there). The DB-authoritative half (revocation, live user status) lives in
// `session.ts` and only runs in Node route/page contexts.
export const SESSION_COOKIE = "bt_session";
export const JWT_ALG = "HS256";

export function jwtSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set — see .env.example.");
  return new TextEncoder().encode(secret);
}

export interface SessionClaims {
  sub: string; // userId
  jti: string; // AuthSession row id
  role: Role;
  status: UserStatus;
}

/** Signature + expiry only. Middleware's fast gate — see `getCurrentUser` for the real authority. */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecretKey(), { algorithms: [JWT_ALG] });
    if (typeof payload.sub !== "string" || typeof payload.jti !== "string") return null;
    return {
      sub: payload.sub,
      jti: payload.jti,
      role: payload.role as Role,
      status: payload.status as UserStatus,
    };
  } catch {
    return null;
  }
}
