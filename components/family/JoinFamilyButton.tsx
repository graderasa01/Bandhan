"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import Button from "@/components/ui/Button";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * The one action in the whole invite flow, and the only place a POST fires —
 * the page itself (the GET) never binds anything. See the API route's
 * comment for why: link-preview crawlers fetch this page server-side before
 * a human ever sees it, and an auto-bind-on-load would hand the seat to the
 * bot instead of the person who tapped it.
 */
export default function JoinFamilyButton({ token }: { token: string }) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/f/${token}/join`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.message ?? t("family.joinButton.genericError", "Kuch galat ho gaya — dobara try karein."));
        setBusy(false);
        return;
      }
      router.push("/family");
      router.refresh();
    } catch {
      setError(t("family.joinButton.networkError", "Network error — dobara try karein."));
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="primary" size="lg" fullWidth loading={busy} icon={<Users className="size-4" />} onClick={join}>
        {t("family.joinButton.yesJoin", "Yes, Join")}
      </Button>
      {error && <p className="mt-3 text-center text-[0.8125rem] text-danger">{error}</p>}
      {busy && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[0.75rem] text-subtle">
          <Loader2 className="size-3.5 animate-spin" />
          {t("family.joinButton.joining", "Jod rahe hain...")}
        </p>
      )}
    </div>
  );
}
