"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/LanguageProvider";

/** C7's master toggle — "Meri Soch Board kisi ko na dikhe". Off hides every entry, everywhere, including outstanding share links. */
export default function SochBoardVisibilityToggle({ initialVisible }: { initialVisible: boolean }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [visible, setVisible] = useState(initialVisible);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !visible;
    setBusy(true);
    try {
      const res = await fetch("/api/profile/soch-board-visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("vibe.sochBoardVisibilityToggle.saveError", "Save nahi hua"), description: json.message, tone: "error" });
        return;
      }
      setVisible(next);
      router.refresh();
    } catch {
      toast({ title: t("vibe.sochBoardVisibilityToggle.networkError", "Network error — dobara try karein"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[0.875rem] font-medium text-ink">
          {t("vibe.sochBoardVisibilityToggle.title", "Meri Soch Board dikhe")}
        </p>
        <p className="text-[0.75rem] text-muted">
          {t("vibe.sochBoardVisibilityToggle.description", "Off karne par koi bhi aapki poll answers nahi dekh payega.")}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={visible}
        aria-label={t("vibe.sochBoardVisibilityToggle.ariaLabel", "Soch Board visibility")}
        disabled={busy}
        onClick={toggle}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60",
          visible ? "bg-gold-500" : "bg-line-strong",
        )}
      >
        {busy ? (
          <Loader2 className="absolute inset-0 m-auto size-3.5 animate-spin text-white" />
        ) : (
          <span
            className={cn(
              "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform",
              visible ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        )}
      </button>
    </div>
  );
}
