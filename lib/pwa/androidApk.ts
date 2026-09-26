import "server-only";

/**
 * The native Android app, offered as an APK download on the public home page —
 * separate from the PWA install next to it, which is the website itself.
 *
 * ## Where the file lives
 *
 * Not in this repo and not on the app server: an APK is tens of megabytes, the
 * container's disk is wiped on every deploy, and the project already keeps
 * files that must outlive deploys in its public object store (Cloudflare R2,
 * see DEPLOYMENT.md). A release is uploaded there — any HTTPS host works — and
 * `ANDROID_APK_URL` names that file.
 *
 * ## The stable link
 *
 * The site never links to the file itself. It links to
 * `ANDROID_APK_DOWNLOAD_PATH`, which redirects to whatever `ANDROID_APK_URL`
 * names at that moment — so a new release is one upload and one variable, and
 * every link already shared keeps pointing at the latest build.
 *
 * ## No fake button
 *
 * Unset, or anything but an https URL, means there is no APK to offer: the
 * home page shows no download option and the stable link answers 404.
 */
export const ANDROID_APK_DOWNLOAD_PATH = "/download/android";

export function androidApkUrl(): string | null {
  const raw = process.env.ANDROID_APK_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
