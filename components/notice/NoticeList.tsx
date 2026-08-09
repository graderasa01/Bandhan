"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Bell,
  Gift,
  Headset,
  Heart,
  Lock,
  Megaphone,
  MessageCircleQuestion,
  Mic,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import EmptyState from "@/components/states/EmptyState";
import { emitNoticeCountChanged } from "@/lib/notices/events";
import type { NoticeView } from "@/lib/contracts/notice";
import { useT } from "@/components/i18n/LanguageProvider";
import type { Translate } from "@/lib/i18n/translate";

const ICONS: Record<NoticeView["kind"], typeof Bell> = {
  VOICE_NOTE_RECEIVED: Mic,
  QUESTION_ASKED: MessageCircleQuestion,
  QUESTION_ANSWERED: MessageCircleQuestion,
  QUEST_AVAILABLE: Sparkles,
  REWARD_EARNED: Gift,
  FAMILY_ACTION: Users,
  MATCH_CREATED: Heart,
  CHAT_NUDGE: Bell,
  MATCHMAKER_UPDATE: Headset,
  PLAN_GRANTED: BadgeCheck,
  ANNOUNCEMENT: Megaphone,
};

/** Short, non-precise. "4 din pehle" is what a person wants; a timestamp isn't. */
function ago(iso: string, t: Translate): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t("notice.list.timeNow", "abhi");
  if (mins < 60) return `${mins}${t("notice.list.timeMin", " min pehle")}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}${t("notice.list.timeHours", " ghante pehle")}`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}${t("notice.list.timeDays", " din pehle")}`;
  return `${Math.round(days / 30)}${t("notice.list.timeMonths", " mahine pehle")}`;
}

export default function NoticeList({ initial }: { initial: NoticeView[] }) {
  const router = useRouter();
  const t = useT();
  const [notices, setNotices] = useState(initial);
  const [marking, setMarking] = useState(false);

  const unread = notices.filter((n) => !n.read).length;

  async function open(notice: NoticeView) {
    if (!notice.read) {
      setNotices((list) => list.map((n) => (n.id === notice.id ? { ...n, read: true } : n)));
      await fetch(`/api/notices/${notice.id}/read`, { method: "POST" }).catch(() => {});
      emitNoticeCountChanged();
      router.refresh();
    }
    if (notice.href) router.push(notice.href);
  }

  async function markAll() {
    setMarking(true);
    setNotices((list) => list.map((n) => ({ ...n, read: true })));
    await fetch("/api/notices", { method: "POST" }).catch(() => {});
    setMarking(false);
    emitNoticeCountChanged();
    router.refresh();
  }

  if (notices.length === 0) {
    return (
      <EmptyState
        title={t("notice.list.emptyTitle", "Abhi kuch naya nahi hai")}
        description={t(
          "notice.list.emptyDescription",
          "Jab koi aapki profile par react karega — voice note, sawaal, ya family ki activity — wo yahan dikhega.",
        )}
      />
    );
  }

  return (
    <div>
      {unread > 0 && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-muted">
            {unread}
            {t("notice.list.newSuffix", " naye")}
          </p>
          <button
            type="button"
            onClick={markAll}
            disabled={marking}
            className="min-h-12 px-2 text-sm font-medium text-gold-700 underline underline-offset-2 disabled:opacity-50"
          >
            {t("notice.list.markAllRead", "Mark All Read")}
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {notices.map((n) => {
          const Icon = ICONS[n.kind] ?? Bell;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                  n.read
                    ? "border-line bg-surface hover:bg-bg-subtle"
                    : "border-gold-300/60 bg-gold-50 hover:bg-gold-100 dark:bg-gold-900/20",
                )}
              >
                <span
                  className={cn(
                    "relative grid size-9 shrink-0 place-items-center rounded-full",
                    n.read ? "bg-bg-subtle text-muted" : "bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg",
                  )}
                >
                  <Icon className="size-4" />
                  {n.actorMasked && (
                    <span className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full border border-surface bg-wine-700 text-white">
                      <Lock className="size-2.5" />
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold text-ink">{n.title}</span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">{n.body}</span>
                  <span className="mt-1 block text-[0.6875rem] text-subtle">{ago(n.createdAt, t)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
