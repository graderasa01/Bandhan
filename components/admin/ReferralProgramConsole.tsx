"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import type { MemberReferralConfigValues } from "@/lib/services/referral/memberReferralConfig";

export interface ReferralConsoleLeader {
  userId: string;
  name: string;
  joined: number;
  qualified: number;
  rewardsEarned: number;
}

export interface ReferralConsoleRecent {
  id: string;
  referrerName: string;
  joinerName: string;
  status: "PENDING" | "QUALIFIED" | "DISQUALIFIED";
  /** ISO — Dates do not survive the server/client boundary intact. */
  joinedAt: string;
}

export interface ReferralConsoleState {
  config: MemberReferralConfigValues;
  /** Live catalog, so the reward can only ever be set to a plan that exists. */
  plans: { code: string; name: string }[];
  totalJoined: number;
  totalQualified: number;
  totalPending: number;
  rewardsGranted: number;
  planDaysGranted: number;
  leaders: ReferralConsoleLeader[];
  recent: ReferralConsoleRecent[];
}

const STATUS_LABEL: Record<ReferralConsoleRecent["status"], string> = {
  PENDING: "Profile baaki",
  QUALIFIED: "Gina gaya",
  DISQUALIFIED: "Nahi gina",
};

const STATUS_TONE: Record<ReferralConsoleRecent["status"], string> = {
  PENDING: "border-line bg-bg-subtle text-muted",
  QUALIFIED: "border-trust/30 bg-trust-bg text-trust",
  DISQUALIFIED: "border-wine-200 bg-wine-50 text-wine-700 dark:border-wine-900/40 dark:bg-wine-900/20 dark:text-wine-300",
};

/**
 * The member referral program's control panel.
 *
 * Every dial saves on its own — the same one-control-at-a-time shape
 * `PilotConsole` uses, and for the same reason: an admin changing the reward
 * during a launch push should not have to re-submit six unrelated fields, and
 * the service validates each one on its own terms anyway.
 *
 * The counts above the dials are read from the server's props on every render,
 * so a `router.refresh()` after a save updates them rather than leaving a
 * stale number on screen for the rest of the session.
 */
export default function ReferralProgramConsole({ initial }: { initial: ReferralConsoleState }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [config, setConfig] = useState(initial.config);

  async function send(key: string, patch: Partial<MemberReferralConfigValues>) {
    if (busy) return false;
    setBusy(key);
    try {
      const res = await fetch("/api/admin/referral-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast({ title: "Nahi ho paya", description: json?.message ?? "Dobara try karein.", tone: "error" });
        return false;
      }
      toast({ title: "Save ho gaya", tone: "success" });
      router.refresh();
      return true;
    } catch {
      toast({ title: "Network error", tone: "error" });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const rewardPlanName =
    initial.plans.find((p) => p.code === config.rewardPlanCode)?.name ?? config.rewardPlanCode;

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ---------------- Master switch ---------------- */}
      <Card variant={config.enabled ? "soft" : "warning"} padding="md">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => {
              setConfig({ ...config, enabled: e.target.checked });
              void send("enabled", { enabled: e.target.checked });
            }}
            className="mt-0.5 size-4 accent-[var(--color-gold-600)]"
          />
          <span className="text-[0.8125rem] leading-relaxed text-ink">
            Referral program chaalu hai
            <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-muted">
              Band karne par link chalte rahenge aur jo log aayenge wo record bhi honge — sirf naya reward milna
              ruk jaayega. Jo reward pehle mil chuka hai wo waise ka waisa rahega; band karna kisi se uska plan
              wapas nahi leta.
            </span>
          </span>
        </label>
      </Card>

      {/* ---------------- Numbers ---------------- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Aaye" value={initial.totalJoined} />
        <Stat label="Profile poori" value={initial.totalQualified} />
        <Stat label="Baaki" value={initial.totalPending} />
        <Stat label="Reward diye" value={initial.rewardsGranted} />
        <Stat label="Plan-din diye" value={initial.planDaysGranted} highlight />
      </div>

      {/* ---------------- The reward ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Reward</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Abhi ka sauda: <strong>{config.referralsPerReward}</strong> log jinki profile poori ho jaaye ={" "}
          <strong>
            {rewardPlanName} {config.rewardDays} din
          </strong>
          , zyada se zyada {config.maxRewardsPerUser} baar. Ye paisa nahi hai — plan ke din hain, isliye galat
          istemaal ka kharcha bina use hua access hota hai, jeb se gaya paisa nahi.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <PlanPicker
            label="Kaunsa plan milega"
            hint="Sirf wo plan jo abhi catalog me hai. Plan ka naam badalne se ye apne aap nahi badalta."
            value={config.rewardPlanCode}
            plans={initial.plans}
            busy={busy === "rewardPlanCode"}
            onChange={(v) => {
              setConfig({ ...config, rewardPlanCode: v });
              void send("rewardPlanCode", { rewardPlanCode: v });
            }}
          />
          <Dial
            label="Kitne din ka"
            hint="Ek reward ka plan itne din chalega. Agla reward milne par din jud jaate hain, dobara shuru nahi hote."
            value={config.rewardDays}
            busy={busy === "rewardDays"}
            onChange={(v) => setConfig({ ...config, rewardDays: v })}
            onSave={(v) => send("rewardDays", { rewardDays: v })}
          />
          <Dial
            label="Ek reward ke liye kitne log"
            hint="Itne log jinki profile poori ho — tab ek reward. Launch push me 1-2 rakha ja sakta hai."
            value={config.referralsPerReward}
            busy={busy === "referralsPerReward"}
            onChange={(v) => setConfig({ ...config, referralsPerReward: v })}
            onSave={(v) => send("referralsPerReward", { referralsPerReward: v })}
          />
          <Dial
            label="Ek user zyada se zyada kitne reward"
            hint="0 rakhne par program chalega par kisi ko reward nahi milega. Bina cap ke ek WhatsApp group hamesha ke liye free plan ban jaata hai."
            value={config.maxRewardsPerUser}
            busy={busy === "maxRewardsPerUser"}
            onChange={(v) => setConfig({ ...config, maxRewardsPerUser: v })}
            onSave={(v) => send("maxRewardsPerUser", { maxRewardsPerUser: v })}
          />
        </div>
      </Card>

      {/* ---------------- The joiner's bar ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Naya member kab &ldquo;gina&rdquo; jaayega</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Ye program ka asli maqsad hai. Sirf sign-up par reward dene se app un khaali profiles se bhar jaati hai
          jinse kisi ka rishta nahi banta — isliye ginti tabhi hoti hai jab naye member ki profile aisi ho jo kisi
          ajnabi ko imaandari se dikhayi ja sake.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <Switch
            label="Ek approved photo zaroori ho"
            hint="Sirf upload nahi — approved. Pending photo kuch bhi ho sakti hai, aur yahi ek cheez plan dene se pehle khadi hai."
            checked={config.requireJoinerPhoto}
            busy={busy === "requireJoinerPhoto"}
            onChange={(v) => {
              setConfig({ ...config, requireJoinerPhoto: v });
              void send("requireJoinerPhoto", { requireJoinerPhoto: v });
            }}
          />
          <Switch
            label="Phone ya email verified ho"
            hint="Farzi accounts ke khilaf sabse mazboot ek control. Pilot ke dauraan sabse pehle isi ko dheela karne ka man karega — isliye switch hai."
            checked={config.requireJoinerVerifiedContact}
            busy={busy === "requireJoinerVerifiedContact"}
            onChange={(v) => {
              setConfig({ ...config, requireJoinerVerifiedContact: v });
              void send("requireJoinerVerifiedContact", { requireJoinerVerifiedContact: v });
            }}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Dial
            label="Profile kam se kam kitne % poori"
            hint="Full profile score (zaroori + optional, sensitive aur photo chhod kar). 100 maangne par lagbhag koi paas nahi hoga."
            value={config.joinerMinCompletionPercent}
            busy={busy === "joinerMinCompletionPercent"}
            onChange={(v) => setConfig({ ...config, joinerMinCompletionPercent: v })}
            onSave={(v) => send("joinerMinCompletionPercent", { joinerMinCompletionPercent: v })}
          />
        </div>
      </Card>

      {/* ---------------- The referrer's own half ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Bulane wale ka apna hissa</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Inke bina program us aadmi ko inaam de dega jo app me profiles to bhar raha hai par khud naam aur khaali
          photo slot bana baitha hai. Log gine phir bhi jaate rahenge — reward tabhi milega jab inki apni profile
          bhi poori ho, aur milte hi pichhle sab rung ek saath settle ho jaate hain.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <Switch
            label="Apni profile live honi chahiye"
            hint="Profile submit ho chuki ho aur dusron ko dikh rahi ho."
            checked={config.requireReferrerProfileComplete}
            busy={busy === "requireReferrerProfileComplete"}
            onChange={(v) => {
              setConfig({ ...config, requireReferrerProfileComplete: v });
              void send("requireReferrerProfileComplete", { requireReferrerProfileComplete: v });
            }}
          />
          <Switch
            label="Apni ek approved photo honi chahiye"
            hint='"Link share karo aur profile photo ke saath poori karo" — ye us waade ka doosra hissa hai.'
            checked={config.requireReferrerPhoto}
            busy={busy === "requireReferrerPhoto"}
            onChange={(v) => {
              setConfig({ ...config, requireReferrerPhoto: v });
              void send("requireReferrerPhoto", { requireReferrerPhoto: v });
            }}
          />
        </div>
      </Card>

      {/* ---------------- Abuse ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Galat istemaal</h2>
        <Switch
          label="Ek network se ek hi referral ginein"
          hint="Ek phone/wifi se banaye kai accounts ek hi gine jaate hain. Kisi ka status nahi badalta — ginti kam hoti hai, kyunki ho sakta hai ghar wale sach me ek hi wifi par hon. Agar aapka server client IP forward nahi karta to ise band rakhiye, warna sab ek hi bucket me gir jaayenge."
          checked={config.oneQualifiedPerDevice}
          busy={busy === "oneQualifiedPerDevice"}
          onChange={(v) => {
            setConfig({ ...config, oneQualifiedPerDevice: v });
            void send("oneQualifiedPerDevice", { oneQualifiedPerDevice: v });
          }}
        />
      </Card>

      {/* ---------------- Double-sided ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Naye member ko bhi kuch dena hai?</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          0 din = band (aise hi ship hota hai). Chaalu karne par har referral ka kharcha dugna ho jaata hai, isliye
          ye soch samajh kar liya jaane wala faisla hai — fayda ye ki naye member ko profile poori karne ki wajah
          mil jaati hai.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <PlanPicker
            label="Naye member ko kaunsa plan"
            hint="Tabhi milta hai jab wo khud upar wala bar paar kar le."
            value={config.joinerRewardPlanCode}
            plans={initial.plans}
            busy={busy === "joinerRewardPlanCode"}
            onChange={(v) => {
              setConfig({ ...config, joinerRewardPlanCode: v });
              void send("joinerRewardPlanCode", { joinerRewardPlanCode: v });
            }}
          />
          <Dial
            label="Kitne din (0 = band)"
            hint="Sirf ek baar, judne par."
            value={config.joinerRewardDays}
            busy={busy === "joinerRewardDays"}
            onChange={(v) => setConfig({ ...config, joinerRewardDays: v })}
            onSave={(v) => send("joinerRewardDays", { joinerRewardDays: v })}
          />
        </div>
      </Card>

      {/* ---------------- Share message ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">WhatsApp par kya jaayega</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Link is line ke aage apne aap jud jaata hai. Khaali chhodne par built-in line chalti hai. Yahi ek jumla
          poora acquisition surface hai — badalne me ek keystroke lagna chahiye, deploy nahi.
        </p>
        <ShareMessageField
          value={config.shareMessage ?? ""}
          busy={busy === "shareMessage"}
          onSave={(v) => send("shareMessage", { shareMessage: v })}
        />
      </Card>

      {/* ---------------- Leaderboard ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Sabse zyada bulane wale</h2>
        {initial.leaders.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
            Abhi kisi ne kisi ko nahi bulaya.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {initial.leaders.map((l) => (
              <li
                key={l.userId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line/70 bg-surface-2 px-3 py-2"
              >
                <a
                  href={`/admin/users?q=${encodeURIComponent(l.name)}`}
                  className="font-medium text-ink underline-offset-2 hover:underline"
                >
                  {l.name}
                </a>
                <span className="text-[0.75rem] tabular-nums text-muted">{l.joined} aaye</span>
                <span className="text-[0.75rem] font-semibold tabular-nums text-trust">
                  {l.qualified} profile poori
                </span>
                <span className="ml-auto text-[0.6875rem] text-muted">{l.rewardsEarned} reward</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------------- Recent ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Haal ke referrals</h2>
        {initial.recent.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
            Abhi kuch nahi.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {initial.recent.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line/70 bg-surface-2 px-3 py-2"
              >
                <span className="font-medium text-ink">{r.referrerName}</span>
                <span className="text-[0.75rem] text-muted">ne bulaya</span>
                <span className="font-medium text-ink">{r.joinerName}</span>
                <span className="text-[0.6875rem] text-muted">
                  {new Date(r.joinedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
                <span
                  className={`ml-auto rounded-sm border px-2 py-0.5 text-[0.6875rem] font-medium ${STATUS_TONE[r.status]}`}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-2.5 py-3 text-center">
      <p
        className={`font-[family-name:var(--font-display)] text-2xl font-bold leading-none tabular-nums ${
          highlight ? "text-accent-text" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[0.6875rem] leading-tight text-muted">{label}</p>
    </div>
  );
}

function Dial({
  label,
  hint,
  value,
  busy,
  onChange,
  onSave,
}: {
  label: string;
  hint: string;
  value: number;
  busy: boolean;
  onChange: (v: number) => void;
  onSave: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));

  return (
    <div className="rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
      <label className="text-[0.75rem] font-medium text-ink">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (Number.isInteger(n)) onChange(n);
          }}
          className="min-h-10 w-24 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-gold-500"
        />
        <SaveButton busy={busy} onClick={() => onSave(Number(text))} />
      </div>
      <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

function PlanPicker({
  label,
  hint,
  value,
  plans,
  busy,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  plans: { code: string; name: string }[];
  busy: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
      <label className="text-[0.75rem] font-medium text-ink">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <select
          value={value}
          disabled={busy}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-10 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-gold-500 disabled:opacity-55"
        >
          {/* A plan an admin has deactivated can still be the stored value —
              listing it keeps the picker honest instead of silently showing a
              different plan than the one that is actually being granted. */}
          {!plans.some((p) => p.code === value) && <option value={value}>{value}</option>}
          {plans.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name} ({p.code})
            </option>
          ))}
        </select>
        {busy && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" />}
      </div>
      <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

function Switch({
  label,
  hint,
  checked,
  busy,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  busy: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--color-gold-600)]"
      />
      <span className="text-[0.8125rem] leading-relaxed text-ink">
        {label}
        <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-muted">{hint}</span>
      </span>
    </label>
  );
}

function ShareMessageField({
  value,
  busy,
  onSave,
}: {
  value: string;
  busy: boolean;
  onSave: (v: string) => void;
}) {
  const [text, setText] = useState(value);

  return (
    <div className="mt-3">
      <textarea
        value={text}
        rows={3}
        maxLength={300}
        onChange={(e) => setText(e.target.value)}
        placeholder="Khaali chhod dijiye to built-in line chalegi."
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-gold-500"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[0.6875rem] tabular-nums text-muted">{text.length}/300</span>
        <SaveButton busy={busy} onClick={() => onSave(text)} />
      </div>
    </div>
  );
}

function SaveButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-ink hover:border-gold-500 disabled:opacity-55"
    >
      {busy && <Loader2 className="size-3.5 animate-spin" />}
      Save
    </button>
  );
}
