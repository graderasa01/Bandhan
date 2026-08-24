"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useT } from "@/components/i18n/LanguageProvider";
import ContactVerificationPanel from "@/components/verification/ContactVerificationPanel";

export default function VerifyContactClient({ next }: { next: string }) {
  const t = useT();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <ContactVerificationPanel />

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => router.push(next)}
          className="text-[0.8125rem] font-medium text-muted transition-colors hover:text-ink"
        >
          {t("verifyContact.skip", "Skip for now")}
        </button>
        <Link
          href={next}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-5 text-[0.8125rem] font-semibold text-primary-fg shadow-gold"
        >
          {t("verifyContact.continue", "Continue")}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
