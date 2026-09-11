import Link from "next/link";
import { ArrowUpRight, EyeOff, Radar, Star, TrendingUp, Unlock } from "lucide-react";
import { CornerFlourish } from "@/components/public/_shared/Ornaments";
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
      <div className="bt-card bt-card--flat h-full p-5 sm:p-6">
        <Header t={t} />
        <p className="mt-3 text-sm text-muted">
          {t(
            "userComp.demandTooEarly",
            "Abhi itne log nahi hain ki ye number kuch bata sake. Jaise-jaise naye rishte judenge, yahan dikhne lagega.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="bt-card h-full overflow-hidden p-5 sm:p-6">
      <CornerFlourish className="bt-vine right-0 top-0 size-20 -scale-x-100" />
      <Header t={t} />

      <div className="relative mt-5 flex items-end gap-3">
        <span className="bt-numeral text-5xl">
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
        <p className="relative mt-3 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-bg px-3 py-2 text-[0.8125rem] text-warn">
          <EyeOff className="mt-px size-4 shrink-0" />
          {blockedReason}
        </p>
      ) : (
        <p className="relative mt-3 flex items-center gap-1.5 text-[0.8125rem] text-muted">
          <Star className="size-3.5 shrink-0 text-primary-text" />
          {t("userComp.demandStrongLead", "Inme se ")}
          <span className="font-semibold text-ink">{strong}</span>
          {t("userComp.demandStrongTail", " logon ki list me aap upar aate hain.")}
        </p>
      )}

      {levers.length > 0 && (
        <div className="relative mt-5 border-t border-line pt-4">
          <p className="bt-microlabel mb-2.5">
            {t("userComp.demandHowToGrow", "Ye number kaise badhega")}
          </p>
          <ul className="-mx-2 space-y-1">
            {levers.map((lever) => (
              <li key={lever.id}>
                <Link href={lever.href} className="bt-row bt-row--tight group rounded-xl">
                  <span
                    className={cn(
                      "bt-ring [--paper-ring-size:2.25rem]",
                      lever.kind === "unlock" ? "bt-ring--warn" : "bt-ring--trust",
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
                  <ArrowUpRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-text" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Header({ t }: { t: Translate }) {
  return (
    <div className="relative flex items-center gap-3">
      <span className="bt-ring bt-ring--gold [--paper-ring-size:2.75rem]">
        <Radar className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <h3 className="bt-display text-[1.2rem] leading-snug">{t("userComp.demandTitle", "Aapki Demand")}</h3>
        <p className="mt-0.5 text-[0.8125rem] text-muted">
          {t("userComp.demandSubtitle", "Aap kitne logon ki pasand par khare utarte hain")}
        </p>
      </div>
    </div>
  );
}
