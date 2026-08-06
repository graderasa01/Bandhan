"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API responses vary per endpoint; callers narrow what they read.
type ActionJson = { ok?: boolean; message?: string; [key: string]: any };

/**
 * Shared fetch→toast→refresh logic behind every admin review action
 * (partners, photos, voice-access, ...). Each PATCH hits a different
 * endpoint with a different body shape, so the endpoint + body stay
 * caller-supplied — only the busy-state/error/refresh plumbing is shared.
 */
export function useReviewAction() {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(
    id: string,
    endpoint: string,
    body: Record<string, unknown>,
    onSuccess: (json: ActionJson) => void
  ) {
    setBusyId(id);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Action fail hua", description: json.message, tone: "error" });
        return;
      }
      onSuccess(json);
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  return { busyId, run, toast };
}
