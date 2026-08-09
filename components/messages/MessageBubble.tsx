"use client";

import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageViewModel } from "@/lib/contracts/messages";
import { useT } from "@/components/i18n/LanguageProvider";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Own messages: gold-tinted, right-aligned. Other's: neutral card, left —
 * chat stays a trust surface, not generic app rose/primary.
 *
 * The tick only ever appears on the viewer's own sent messages — knowing
 * whether *your* message was read is the D-11 perk; there is no equivalent
 * signal to show on a message you received.
 */
export default function MessageBubble({
  message,
  own,
  showReadReceipt,
}: {
  message: MessageViewModel;
  own: boolean;
  showReadReceipt: boolean;
}) {
  const t = useT();
  return (
    <div className={cn("flex", own ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3.5 py-2.5 text-[0.9375rem] leading-relaxed",
          own ? "bg-gold-50 dark:bg-gold-900/20" : "border border-line bg-surface",
        )}
      >
        <p className="whitespace-pre-wrap break-words text-ink">{message.body}</p>
        <p className="mt-1 flex items-center justify-end gap-1 text-[0.6875rem] text-subtle">
          {formatTime(message.createdAt)}
          {own && showReadReceipt && (
            <span aria-label={message.readAt ? t("messages.messageBubble.seen", "Seen") : t("messages.messageBubble.sent", "Sent")}>
              {message.readAt ? (
                <CheckCheck className="size-3.5 text-trust" />
              ) : (
                <Check className="size-3.5" />
              )}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
