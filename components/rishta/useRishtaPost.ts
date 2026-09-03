"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The one way the Room writes.
 *
 * Every panel in the Room posts to the same endpoint with a different `action`,
 * and each of them needs the identical four things: a busy flag, an error
 * toast, a refresh, and a guard against double submits. Three copies of that is
 * three chances for one panel to forget the refresh — and a panel that writes
 * without refreshing leaves the "agla kadam" line on screen stating something
 * that stopped being true the moment the user tapped.
 *
 * `router.refresh()` rather than local state on purpose: the next step is
 * computed on the server from the whole rishta, so a topic resolved here can
 * change the sentence at the top of the page. Only the server knows that.
 */
export function useRishtaPost(otherUserId: string) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await fetch(`/api/rishta/${otherUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: t("rishtaRoom.post.failedTitle", "Nahi ho paya"),
          description: json?.message ?? t("rishtaRoom.post.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return false;
      }
      router.refresh();
      return true;
    } catch {
      toast({ title: t("rishtaRoom.post.networkError", "Network error — dobara try karein"), tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { post, busy };
}
