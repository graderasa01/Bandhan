import { NextResponse } from "next/server";
import { destroyFamilySession } from "@/lib/auth/familySession";

export const runtime = "nodejs";

export async function POST() {
  await destroyFamilySession();
  return NextResponse.json({ ok: true });
}
