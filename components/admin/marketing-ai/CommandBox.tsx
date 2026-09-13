"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Send } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Field from "@/components/ui/Field";
import { ChipGroup, Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import {
  AUDIENCE_SIDES,
  CHANNEL_LABEL,
  CONVERSION_EVENTS,
  MARKETING_CHANNELS,
  type AudienceSide,
  type CommandGoalInput,
  type ConversionEvent,
  type MarketingChannel,
} from "@/lib/contracts/marketingAi";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Jaipur me ladkiyon ki verified profiles kam hain, ₹500/day me campaign banao.",
  "Pichhle 30 din ke Google aur Meta ads analyse karo.",
  "Shaadi season ke liye 5 Reels aur 3 Stories ke concepts banao.",
  "Homepage conversion kyun kam hai aur kya badalna chahiye?",
];

const AUDIENCE_LABEL: Record<AudienceSide, string> = {
  all: "Sab",
  men: "Ladke",
  women: "Ladkiyan",
  family: "Family / parents",
  partner: "Partners",
};

/**
 * Zone A (§2). The sentence is the primary input; the details panel is the
 * §5 goal object — budget caps, target, window, channels — and whatever is
 * typed there overrides anything the model reads out of the sentence. The
 * target and the caps can *only* come from here or from the sentence; the
 * model never invents them (guardrails clear one it did).
 */
export default function CommandBox({ disabled, onSubmitted }: { disabled: boolean; onSubmitted: () => void }) {
  const { toast } = useToast();
  const [request, setRequest] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [geography, setGeography] = useState("");
  const [audienceSide, setAudienceSide] = useState<AudienceSide | "">("");
  const [windowDays, setWindowDays] = useState("");
  const [primaryConversion, setPrimaryConversion] = useState<ConversionEvent | "">("");
  const [target, setTarget] = useState("");
  const [daily, setDaily] = useState("");
  const [total, setTotal] = useState("");
  const [channels, setChannels] = useState<MarketingChannel[]>([]);
  const [constraints, setConstraints] = useState("");
  const [stopLoss, setStopLoss] = useState("");

  function goalInput(): CommandGoalInput | undefined {
    const g: CommandGoalInput = {};
    if (geography.trim()) g.geography = geography.trim();
    if (audienceSide) g.audienceSide = audienceSide;
    if (windowDays && Number(windowDays) > 0) g.windowDays = Math.round(Number(windowDays));
    if (primaryConversion) g.primaryConversion = primaryConversion;
    if (target && Number(target) > 0) g.target = Math.round(Number(target));
    if (daily && Number(daily) > 0) g.dailyBudgetRupees = Number(daily);
    if (total && Number(total) > 0) g.totalBudgetRupees = Number(total);
    if (channels.length) g.channels = channels;
    if (constraints.trim()) g.constraints = constraints.trim();
    if (stopLoss.trim()) g.stopLossRule = stopLoss.trim();
    return Object.keys(g).length ? g : undefined;
  }

  async function submit() {
    const text = request.trim();
    if (text.length < 8) {
      toast({ title: "Thoda aur likhiye", description: "Growth Saathi ko goal samajhna hai.", tone: "warning" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/marketing-ai/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: text, goal: goalInput() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Task shuru nahi hua", description: json.message, tone: "error" });
        return;
      }
      setRequest("");
      toast({ title: "Growth Saathi kaam par lag gaya", description: "Data padh kar plan banayega — queue me dikhega.", tone: "success" });
      onSubmitted();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg" variant="luxe">
      <label htmlFor="growth-saathi-command" className="text-sm font-semibold text-ink">
        Growth Saathi ko bataiye kya hasil karna hai
      </label>
      <Textarea
        id="growth-saathi-command"
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Jaise: Jaipur me agle 30 din me verified profiles badhani hain — Google, Facebook aur Instagram ka campaign banao, Reels bhi tayyar karo."
        className="mt-2"
        disabled={busy || disabled}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setRequest(ex)}
            className="rounded-full border border-line bg-surface px-3 py-1 text-[0.75rem] text-muted transition-colors hover:border-gold-500 hover:text-ink"
          >
            {ex}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-4 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary-text"
        aria-expanded={open}
      >
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        Goal details — budget cap, target, geography, channels
      </button>
      <p className="mt-1 text-xs text-muted">
        Jo yahan likhenge wo command par bhaari padega. Target aur budget cap sirf aap dete hain — AI kabhi khud nahi banata.
      </p>

      <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", open ? "mt-4" : "hidden")}>
        <Field label="Geography" hint="City / state / India">
          <Input inputSize="sm" value={geography} onChange={(e) => setGeography(e.target.value)} placeholder="Jaipur" />
        </Field>
        <Field label="Audience side">
          <Select
            selectSize="sm"
            value={audienceSide}
            onChange={(e) => setAudienceSide(e.target.value as AudienceSide | "")}
            placeholder="AI tay kare"
            options={AUDIENCE_SIDES.map((a) => ({ value: a, label: AUDIENCE_LABEL[a] }))}
          />
        </Field>
        <Field label="Window (days)">
          <Input inputSize="sm" type="number" min={1} max={365} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} placeholder="30" />
        </Field>
        <Field label="Primary conversion">
          <Select
            selectSize="sm"
            value={primaryConversion}
            onChange={(e) => setPrimaryConversion(e.target.value as ConversionEvent | "")}
            placeholder="AI tay kare"
            options={CONVERSION_EVENTS.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <Field label="Target (count)" hint="Sirf aapka number">
          <Input inputSize="sm" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="jaise 40" />
        </Field>
        <Field label="Daily budget cap (₹)">
          <Input inputSize="sm" type="number" min={1} value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="500" />
        </Field>
        <Field label="Total budget cap (₹)">
          <Input inputSize="sm" type="number" min={1} value={total} onChange={(e) => setTotal(e.target.value)} placeholder="15000" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Allowed channels" hint="Khaali = AI chune">
            <ChipGroup
              options={MARKETING_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
              selected={channels}
              onToggle={(v) => setChannels((cur) => (cur.includes(v as MarketingChannel) ? cur.filter((x) => x !== v) : [...cur, v as MarketingChannel]))}
            />
          </Field>
        </div>
        <div className="sm:col-span-2 lg:col-span-2">
          <Field label="Constraints" hint="Brand / safety / kya nahi karna">
            <Input inputSize="sm" value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder="Sirf Hinglish; koi discount claim nahi" />
          </Field>
        </div>
        <Field label="Stop-loss rule">
          <Input inputSize="sm" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="₹1,500 spend, zero profile → pause" />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          {disabled ? "Ek task chal raha hai — uske baad naya command dijiye." : "Ctrl/⌘ + Enter se bhi bhej sakte hain."}
        </p>
        <Button variant="accent" size="md" loading={busy} disabled={disabled || request.trim().length < 8} onClick={submit} icon={<Send className="size-4" />}>
          Ask Growth Saathi
        </Button>
      </div>
    </Card>
  );
}
