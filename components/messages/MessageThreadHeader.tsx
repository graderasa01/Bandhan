"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Pill from "@/components/ui/Pill";
import type { ChatParticipant } from "@/lib/contracts/messages";
import { useT } from "@/components/i18n/LanguageProvider";

/** In-canvas header for the full-bleed thread view — mirrors ReelHeader.tsx's structure. */
export default function MessageThreadHeader({ other, actions }: { other: ChatParticipant; actions?: ReactNode }) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6">
      <Link
        href="/user/messages"
        aria-label={t("messages.threadHeader.backToConversations", "Back to Conversations")}
        className="grid size-9 shrink-0 touch-target place-items-center rounded-full text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
      >
        <ArrowLeft className="size-5" />
      </Link>

      <Avatar name={other.displayName} photoUrl={other.photoUrl} size="sm" />

      <div className="min-w-0 flex-1">
        {other.profileId ? (
          <Link
            href={`/user/profile/${other.profileId}`}
            className="truncate font-semibold text-ink transition-colors hover:text-primary-text"
          >
            {other.displayName}
          </Link>
        ) : (
          <p className="truncate font-semibold text-ink">{other.displayName}</p>
        )}
        {other.verified && (
          <Pill tone="trust" size="sm">
            {t("messages.threadHeader.verified", "Verified")}
          </Pill>
        )}
      </div>

      {actions}
    </div>
  );
}
