import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { toUserDto } from "@/lib/auth/dto";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user: user ? toUserDto(user) : null });
}
