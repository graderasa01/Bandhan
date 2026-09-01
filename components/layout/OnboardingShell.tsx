"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, Trash2, X } from "lucide-react";
import BrandMark from "@/components/layout/BrandMark";
import ThemeToggle from "@/components/ui/ThemeToggle";
import LanguageToggle from "@/components/i18n/LanguageToggle";
import { useT } from "@/components/i18n/LanguageProvider";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import { useProfile } from "@/lib/profile/profileState";
import { STAGES } from "@/lib/profile/stages";
import { cn } from "@/lib/utils";

/**
 * Chrome for the onboarding journey — deliberately almost empty.
 *
 * No sidebar, no bottom nav, no links into the app. Someone building their
 * first profile has nothing to navigate to yet, and surrounding a focused
 * task with a full dashboard is an invitation to wander off mid-way. What is
 * here: where you are, what it unlocks, and an honest way out that keeps the
 * draft.
 */
export default function OnboardingShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { completion, stage, live, ready, reset } = useProfile();
  const [confirmReset, setConfirmReset] = useState(false);
  const stageDef = STAGES.find((s) => s.stage === stage) ?? STAGES[0];

  return (
    /* Tokens only, not `bt-paper`: this shell already lays its own blush
       wash over the ground below, and the skin's cream + grain under that
       is two textures fighting. The warm surfaces, hairlines and serif
       page titles are what make register → verify → build read as the
       same product as everything the user lands in afterwards. */
    <div className="bt-canvas bt-canvas--dense relative flex min-h-dvh flex-col bg-bg">
      {/* A single soft wash behind everything: enough depth that the page reads
          as warm rather than washed-out beige, with no cost to text contrast. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_-10%,var(--color-rose-50)_0%,transparent_55%)] dark:bg-[radial-gradient(120%_80%_at_50%_-10%,var(--color-rose-900)_0%,transparent_55%)]"
      />
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex min-h-12 min-w-12 items-center justify-center"
            aria-label="BandhanTak home"
          >
            <BrandMark showWordmark={false} />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] font-semibold leading-tight text-ink">
              {t(`onboarding.stage${stageDef.stage}.title`, stageDef.title)}
            </p>
            <p className="truncate text-[0.75rem] leading-tight text-primary-text">
              {live
                ? t("onboarding.profileLive", "Aapki profile live hai")
                : t(`onboarding.stage${stageDef.stage}.unlocks`, stageDef.unlocks)}
            </p>
          </div>

          <LanguageToggle className="hidden sm:inline-flex" />
          <ThemeToggle />

          <Link
            href={live ? "/user/dashboard" : "/"}
            className={cn(
              "inline-flex min-h-12 touch-target items-center gap-1.5 rounded-full px-3",
              "text-[0.8125rem] font-medium text-muted transition-colors hover:bg-bg-subtle hover:text-ink",
            )}
          >
            {live ? <Check className="size-4 text-trust" /> : <X className="size-4" />}
            <span className="hidden sm:inline">
              {live ? t("onboarding.done", "Ho gaya") : t("onboarding.later", "Baad me")}
            </span>
          </Link>
        </div>

        {/* Progress lives in the chrome so it is always visible without
            stealing a row from the actual work. */}
        <div
          className="h-1 w-full bg-bg-subtle"
          role="progressbar"
          aria-valuenow={ready ? completion : 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Profile completion progress"
        >
          <div
            className="h-full bg-gradient-to-r from-rose-500 via-gold-500 to-trust transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${ready ? completion : 0}%` }}
          />
        </div>
      </header>

      {/*
       * Wider than the reading measure on purpose: the question phase puts an
       * upcoming-questions rail beside the question on large screens. Every
       * other phase re-centres itself to a narrow column, so widening here does
       * not make the focused screens sprawl.
       */}
      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6 sm:px-6 lg:pt-10">{children}</div>
      </main>

      {/* Once the profile is live, "draft saves automatically" and "erase
          everything" both stop being useful — the live screen already has
          its own clear next actions, and a reset button next to a working
          profile is a risk with no upside at that point. */}
      {!live && (
        <footer className="border-t border-line px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
            <p className="text-center text-[0.75rem] leading-snug text-subtle">
              {t(
                "onboarding.draftSaved",
                "Draft apne aap save hota hai. Jab chahein wapas aakar yahin se shuru kar sakte hain.",
              )}
            </p>
            {/* A saved draft that cannot be thrown away is a trap: somebody who
                filled it for the wrong person, or just wants to start over, has
                no way out. Confirmed, because it is not undoable. */}
            {ready && completion > 0 && (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="min-h-12 touch-target text-[0.75rem] font-medium text-muted underline underline-offset-4 hover:text-ink"
              >
                {t("onboarding.eraseAll", "Erase All & Start Over")}
              </button>
            )}
          </div>
        </footer>
      )}

      <Sheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t("onboarding.resetTitle", "Sab kuch mita dein?")}
        variant="center"
      >
        <p className="text-[0.9375rem] leading-relaxed text-muted">
          {t(
            "onboarding.resetBody",
            "Ab tak bhari gayi saari baatein hat jayengi aur profile pehle se shuru hogi. Ye wapas nahi aa payengi.",
          )}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="danger"
            className="sm:flex-1"
            onClick={() => {
              reset();
              // Phase, miss counters and cached translations live outside the
              // draft; a reload is what actually returns the user to step one.
              window.location.reload();
            }}
          >
            <Trash2 className="size-4" />
            {t("onboarding.resetConfirm", "Yes, Erase")}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>
            {t("onboarding.resetCancel", "No, Keep It")}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
