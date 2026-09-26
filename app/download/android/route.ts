import { NextResponse } from "next/server";
import { androidApkUrl } from "@/lib/pwa/androidApk";

export const runtime = "nodejs";
// Read at request time, never baked into a build: the moment
// `ANDROID_APK_URL` names a new release, this link follows it.
export const dynamic = "force-dynamic";

/** The one stable link to the latest Android APK — see `lib/pwa/androidApk.ts`. */
export function GET() {
  const url = androidApkUrl();
  if (!url) {
    return new NextResponse("Android app abhi download ke liye available nahi hai.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
