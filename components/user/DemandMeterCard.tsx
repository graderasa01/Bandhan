import Link from "next/link";
import { ArrowUpRight, EyeOff, Radar, Star, TrendingUp, Unlock } from "lucide-react";
import Card from "@/components/ui/Card";
import CountUp from "@/components/ui/CountUp";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { Translate } from "@/lib/i18n/translate";
import type { DemandSnapshot } from "@/lib/services/demand/demandService";

/**
 * The dashboard's answer to "kya main kisi ko pasand aa raha hoon?" — the one
 * question every matrimony user has and no app answers.
 *
 * Every number here is a row count from `demandService`, and every lever is a
 * filter the user genuinely fails. Nothing is projected or rounded up: a user
 * who acts on a lever and doesn't see the number move would never trust this
 * card again.
 */
export default async function DemandMeterCard({ demand }: { demand: DemandSnapshot }) {
  const t = await getT();
  const { seekers, reachable, strong, levers, blockedReason } = demand;

  if (seekers === 0) {
    return (
      <Card variant="soft" padding="lg">
        <Header t={t} />
        <p className="mt-3 text-sm text-muted">
          {t(
            "userComp.demandTooEarly",
            "Abhi itne log nahi hain ki ye number kuch bata sake. Jaise-jaise naye rishte judenge, yahan dikhne lagega.",
          )}
        </p>
      </Card>
    );
  }

  return (
    <Card variant="default" padding="lg">
      <Header t={t} />

      <div className="mt-4 flex items-end gap-3">
        <span className="font-[family-name:var(--font-display)] text-5xl font-bold leading-none text-wine-700">
          <CountUp value={reachable} />
        </span>
        <span className="pb-1 text-sm text-muted">
          {t("userComp.demandCanFindYou", "log aapko dhoondh sakte hain")}
          <span className="block text-[0.75rem]">
            {t("userComp.demandOutOfLead", "aapke jaise rishte dhoondhne wale kul ")}
            {seekers}
            {t("userComp.demandOutOfTail", " logon me se")}
          </span>
        </span>
      </div>

      {blockedReason ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-[0.8125rem] text-warn">
          <EyeOff className="mt-px size-4 shrink-0" />
          {blockedReason}
        </p>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-[0.8125rem] text-muted">
          <Star className="size-3.5 shrink-0 text-gold-600" />
          {t("userComp.demandStrongLead", "Inme se ")}
          <span className="font-semibold text-ink">{strong}</span>
          {t("userComp.demandStrongTail", " logon ki list me aap upar aate hain.")}
        </p>
      )}

      {levers.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
            {t("userComp.demandHowToGrow", "Ye number kaise badhega")}
          </p>
          <ul className="space-y-1.5">
            {levers.map((lever) => (
              <li key={lever.id}>
                <Link
                  href={lever.href}
                  className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-bg-subtle"
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full",
                      lever.kind === "unlock" ? "bg-warn-bg text-warn" : "bg-trust-bg text-trust",
                    )}
                  >
                    {lever.kind === "unlock" ? (
                      <Unlock className="size-4" />
                    ) : (
                      <TrendingUp className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{lever.label}</span>
                    <span className="block text-[0.8125rem] leading-snug text-muted">{lever.detail}</span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-gold-700" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Header({ t }: { t: Translate }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
        <Radar className="size-4.5" />
      </span>
      <div>
        <h3 className="text-base font-semibold text-wine-700">{t("userComp.demandTitle", "Aapki Demand")}</h3>
        <p className="text-[0.8125rem] text-muted">
          {t("userComp.demandSubtitle", "Aap kitne logon ki pasand par khare utarte hain")}
        </p>
      </div>
    </div>
  );
}
