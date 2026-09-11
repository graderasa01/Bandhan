"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, Pencil, Sparkles, Trash2, WifiOff } from "lucide-react";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { isMinimumField } from "@/lib/profile/readiness";
import { useProfile } from "@/lib/profile/profileState";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/motion";
import Button from "@/components/ui/Button";
import InfoTip from "@/components/ui/InfoTip";
import Pill from "@/components/ui/Pill";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * One review screen, reached from all three ways in.
 *
 * ## What it replaces
 *
 * Biodata upload used to land on a "harvest" panel that counted what had been
 * read and then pushed the user straight into another long interview. So the
 * one moment when a person is actually looking at what a model claimed about
 * them was spent on a summary they could not act on: no confirm, no edit, no
 * reject — the corrections happened later, somewhere else, if at all.
 *
 * The order here is the order of what the user has to *do*:
 *
 *   1. **Aapki nazar chahiye** — values a model produced that nobody has
 *      checked. These are the only rows with real controls, because they are
 *      the only rows that need a decision. Minimum fields first: those are the
 *      ones actually holding the profile back.
 *   2. **Ye abhi baaki hai** — minimum fields with no usable answer, and one
 *      action to go fill them.
 *   3. **Ye mil gaya** — everything already settled, collapsed. Available,
 *      not recited.
 *
 * ## The rule it enforces on screen
 *
 * "Profile live karein" is disabled until the server-authoritative rule says
 * ready, and pressing it waits for a real save before anything says "live" —
 * `flushSave` returns the server's own answer. An offline tap shows the save
 * failing, not a success screen. See `lib/profile/readiness.ts`.
 */
export default function ProfileReviewPanel({
  onEdit,
  onFillMissing,
  onGoLive,
  /** Biodata headings we saw but have no field for — shown, never dropped. */
  ignoredMentions = [],
  /** Set when this review follows an upload, which changes only the heading. */
  fromBiodata = false,
}: {
  onEdit: (key: string) => void;
  onFillMissing: () => void;
  onGoLive: () => void;
  ignoredMentions?: string[];
  fromBiodata?: boolean;
}) {
  const t = useT();
  const { draft, readiness, confirmField, clearField, flushSave, live } = useProfile();
  const [showSettled, setShowSettled] = useState(false);
  const [showBiodataDetail, setShowBiodataDetail] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishFailed, setPublishFailed] = useState(false);

  const rows = useMemo(() => {
    const keys = Object.keys(draft.values).filter(
      (k) => FIELD_BY_KEY[k] && (draft.values[k] ?? "").trim().length > 0,
    );
    const needsCheck = keys
      .filter((k) => {
        const m = draft.meta[k];
        return m && !m.confirmed && (m.source === "ai" || m.source === "inferred");
      })
      // A blocked minimum field is the difference between live and not live, so
      // it goes first however confident the model was about the rest.
      .sort((a, b) => Number(isMinimumField(b)) - Number(isMinimumField(a)));
    const settled = keys.filter((k) => !needsCheck.includes(k));
    return { needsCheck, settled };
  }, [draft.values, draft.meta]);

  const missing = readiness.blockers.filter((b) => b.reason !== "unconfirmed");

  /**
   * The value as a person would say it.
   *
   * A date comes back from the server as `1995-04-12` (that is what the column
   * holds) but was typed as `12/04/1995`. Both are valid to the rule; only one
   * of them is what somebody is checking against their own memory, and a
   * review screen that prints the database's format is asking the user to
   * parse rather than to recognise.
   */
  function display(key: string, raw: string): string {
    if (FIELD_BY_KEY[key]?.type !== "date") return raw;
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : raw;
  }

  async function publish() {
    haptic("tap");
    setPublishing(true);
    setPublishFailed(false);
    const result = await flushSave();
    setPublishing(false);
    // The server's own word, not the fact that a request was sent. This is the
    // check that stops a failed save from painting a "live" screen.
    if (result.ok && result.live) {
      haptic("success");
      onGoLive();
      return;
    }
    setPublishFailed(true);
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="flex flex-wrap items-center gap-1.5 text-3xl leading-tight sm:text-4xl">
          {rows.needsCheck.length > 0
            ? t("profile.review.titleCheck", "Ek baar dekh lijiye")
            : fromBiodata
              ? t("profile.review.titleBiodata", "Biodata padh liya")
              : t("profile.review.titleReady", "Bas itna hi tha")}
          {/* The "AI ne jo samjha wo draft hai" paragraph used to be printed at
              the foot of every screen in this flow. It belongs here — this is
              the screen where AI values are actually on show — and behind a
              tap, because it answers a question rather than opening one. */}
          <InfoTip
            className="align-middle"
            text={t(
              "profile.review.aiDraftTip",
              "AI ne jo samjha wo abhi draft hai. Jo samajh na aaye wo khaali hi rehta hai — apne aap kuch bhara nahi jaata.",
            )}
          />
        </h1>
        <p className="text-pretty leading-relaxed text-muted">
          {`${readiness.done}/${readiness.total} `}
          {t("profile.review.progress", "zaroori details ready hain.")}
        </p>
      </div>

      {/* ---------------- 1. Needs your review ---------------- */}
      {rows.needsCheck.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-warn">
            <AlertCircle className="size-4 shrink-0" />
            {t("profile.review.needsReviewHeading", "Aapki nazar chahiye")}
          </p>
          <ul className="space-y-2">
            {rows.needsCheck.map((key) => {
              const def = FIELD_BY_KEY[key];
              const meta = draft.meta[key];
              return (
                <li
                  key={key}
                  className="rounded-lg border border-warn/30 bg-warn-bg px-4 py-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.6875rem] uppercase tracking-wider text-subtle">
                        {def.label}
                        {isMinimumField(key) && (
                          <span className="ml-1.5 normal-case tracking-normal text-warn">
                            {t("profile.review.blocksLive", "· live hone ke liye zaroori")}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 break-words text-[0.9375rem] font-medium text-ink">
                        {display(key, draft.values[key] ?? "")}
                      </p>
                      {meta?.source === "inferred" && meta.inferredFrom && (
                        <p className="mt-1 flex items-start gap-1.5 text-[0.75rem] leading-snug text-muted">
                          <Sparkles className="mt-0.5 size-3 shrink-0 text-info" />
                          {meta.inferredFrom}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <RowAction
                      icon={Check}
                      tone="confirm"
                      label={t("profile.review.confirm", "Sahi hai")}
                      onClick={() => {
                        haptic("select");
                        confirmField(key);
                      }}
                    />
                    <RowAction
                      icon={Pencil}
                      label={t("profile.review.edit", "Badlein")}
                      onClick={() => onEdit(key)}
                    />
                    <RowAction
                      icon={Trash2}
                      label={t("profile.review.clear", "Hatayein")}
                      onClick={() => {
                        haptic("tap");
                        clearField(key);
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ---------------- 2. Still required ---------------- */}
      {missing.length > 0 && (
        <div className="space-y-2">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
            {t("profile.review.stillNeededHeading", "Ye abhi baaki hai")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {missing.map((b) => (
              <li
                key={b.key}
                className="rounded-full border border-line bg-bg-subtle px-3 py-1 text-[0.8125rem] text-muted"
              >
                {b.label}
              </li>
            ))}
          </ul>
          <Button variant="accent" size="lg" fullWidth onClick={onFillMissing}>
            {missing.length === 1
              ? t("profile.review.fillOne", "1 zaroori detail poori karein")
              : t("profile.review.fillMany", "{count} zaroori details poori karein").replace(
                  "{count}",
                  String(missing.length),
                )}
          </Button>
        </div>
      )}

      {/* ---------------- 3. Already settled, collapsed ---------------- */}
      {rows.settled.length > 0 && (
        <div className="rounded-lg border border-line bg-surface">
          <button
            type="button"
            onClick={() => setShowSettled((o) => !o)}
            aria-expanded={showSettled}
            className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left"
          >
            <Pill tone="trust" size="sm">
              <Check />
              {String(rows.settled.length)}
            </Pill>
            <span className="min-w-0 flex-1 text-[0.875rem] font-medium text-ink">
              {fromBiodata
                ? t("profile.review.settledFromBiodata", "Biodata se mil gaya")
                : t("profile.review.settled", "Ye bhar gaya")}
            </span>
            <ChevronDown
              className={cn("size-4 shrink-0 text-subtle transition-transform", showSettled && "rotate-180")}
            />
          </button>
          {showSettled && (
            <ul className="space-y-0.5 border-t border-line px-2 pb-2 pt-2">
              {rows.settled.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => onEdit(key)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-bg-subtle"
                  >
                    <span className="w-28 shrink-0 truncate text-[0.75rem] text-subtle">
                      {FIELD_BY_KEY[key].label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">
                      {display(key, draft.values[key] ?? "")}
                    </span>
                    <Pencil className="size-3.5 shrink-0 text-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------------- Primary action ---------------- */}
      {live ? (
        /* Already live — because the autosave's own readiness check activated
           the profile the moment the last field was confirmed. The screen says
           so instead of offering a button that would do nothing, and the user
           still got to see everything above it first. */
        <div className="space-y-2">
          <p className="flex items-center justify-center gap-2 text-[0.875rem] font-semibold text-trust">
            <Check className="size-4" />
            {t("profile.review.alreadyLive", "Aapki profile live hai")}
          </p>
          <Button variant="accent" size="lg" fullWidth onClick={onGoLive}>
            {t("profile.review.continue", "Continue")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            variant="accent"
            size="lg"
            fullWidth
            disabled={!readiness.ready || publishing}
            loading={publishing}
            onClick={publish}
          >
            {t("profile.review.goLive", "Make Profile Live")}
          </Button>
          {!readiness.ready && rows.needsCheck.length > 0 && missing.length === 0 && (
            <p className="text-center text-[0.75rem] text-muted">
              {t(
                "profile.review.blockedByReview",
                "Upar wali baatein confirm karte hi profile live ho jayegi.",
              )}
            </p>
          )}
          {publishFailed && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[0.8125rem] leading-snug text-danger"
            >
              <WifiOff className="mt-0.5 size-4 shrink-0" />
              {t(
                "profile.review.saveFailed",
                "Save nahi ho paya — profile abhi live nahi hui. Internet check karke dobara try kijiye.",
              )}
            </p>
          )}
          {/* The passive "we can't save right now" line lives in the shell
              footer, where it covers every screen in this flow. Printing it
              here as well put the same sentence on screen twice. What stays
              here is the *action's* own failure above — a different fact:
              you pressed a button and it did not do what it said. */}
        </div>
      )}

      {/* ---------------- Everything technical, behind one tap ---------------- */}
      {(ignoredMentions.length > 0 || rows.needsCheck.length > 0) && (
        <div className="rounded-lg border border-line bg-bg-subtle">
          <button
            type="button"
            onClick={() => setShowBiodataDetail((o) => !o)}
            aria-expanded={showBiodataDetail}
            className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left"
          >
            <span className="min-w-0 flex-1 text-[0.8125rem] font-medium text-muted">
              {t("profile.review.detailsDisclosure", "Biodata details")}
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-subtle transition-transform",
                showBiodataDetail && "rotate-180",
              )}
            />
          </button>
          {showBiodataDetail && (
            <div className="space-y-3 border-t border-line px-4 py-3">
              {rows.needsCheck.map((key) => {
                const meta = draft.meta[key];
                if (!meta?.sourceSpan && meta?.confidence === undefined) return null;
                return (
                  <p key={key} className="text-[0.75rem] leading-snug text-muted">
                    <span className="font-medium text-ink">{FIELD_BY_KEY[key].label}</span>
                    {meta.sourceSpan && <> — &ldquo;{meta.sourceSpan}&rdquo;</>}
                    {meta.confidence !== undefined && (
                      <> ({Math.round(meta.confidence * 100)}%)</>
                    )}
                  </p>
                );
              })}
              {ignoredMentions.length > 0 && (
                <p className="text-[0.75rem] leading-snug text-muted">
                  {t("profile.review.ignoredPrefix", "Inke liye humare paas abhi jagah nahi:")}{" "}
                  <span className="text-ink">{ignoredMentions.join(", ")}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RowAction({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: typeof Check;
  label: string;
  onClick: () => void;
  tone?: "confirm";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 touch-target items-center gap-1.5 rounded-full border px-3 py-1",
        "text-[0.75rem] font-medium transition-colors active:scale-95",
        tone === "confirm"
          ? "border-trust/40 bg-trust-bg text-trust hover:bg-trust/15"
          : "border-line-strong bg-surface text-muted hover:border-gold-500 hover:text-ink",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </button>
  );
}
