"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import BrandMark from "@/components/layout/BrandMark";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { FAMILY_RELATION_LABELS } from "@/lib/services/family/familyConstants";
import type { FamilyRelation } from "@prisma/client";
import { useT } from "@/components/i18n/LanguageProvider";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import GoogleTranslateWidget from "@/components/i18n/GoogleTranslateWidget";

export default function FamilyHeader({ ownerName, relation }: { ownerName: string; relation: FamilyRelation }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const t = useT();

  async function logout() {
    setBusy(true);
    await fetch("/api/family-portal/logout", { method: "POST" }).catch(() => {});
    router.push("/");
    router.refresh();
  }

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <BrandMark showWordmark={false} />
          <div>
            <p className="text-sm font-semibold text-ink">
              {ownerName}
              {t("family.header.familyCircleSuffix", " ka Family Circle")}
            </p>
            <Badge variant="complete" size="sm">
              {FAMILY_RELATION_LABELS[relation]}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <GoogleTranslateWidget className="hidden md:inline-flex" />
          <Button variant="ghost" size="sm" icon={<LogOut className="size-4" />} loading={busy} onClick={logout}>
            {t("family.header.logout", "Logout")}
          </Button>
        </div>
      </div>
    </div>
  );
}
