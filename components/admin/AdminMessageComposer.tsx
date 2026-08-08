"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Send, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Pill from "@/components/ui/Pill";
import { Checkbox, Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";

type Audience = "USER" | "PARTNER";
type Target = "SINGLE" | "SEGMENT" | "ALL";
type Channel = "APP" | "EMAIL" | "WHATSAPP";

export type SegmentOption = { key: string; audience: Audience; label: string; blurb: string };
export type CapabilityOption = { key: string; label: string; type: "boolean" | "number" | "nullableNumber" };

type Preview = { recipientCount: number; withEmail: number; withMobile: number } | null;

const CHANNELS: { key: Channel; label: string; note: string }[] = [
  { key: "APP", label: "App", note: "Inbox + push, aur dashboard ke pehle card par" },
  { key: "EMAIL", label: "Email", note: "Jinke paas email hai unhi ko" },
  { key: "WHATSAPP", label: "WhatsApp", note: "Jinke paas mobile hai unhi ko" },
];

/**
 * Compose → preview → send. The preview step is not a convenience: `send` is
 * disabled until a recipient count has come back from the server, so nobody
 * broadcasts to a number they never saw.
 */
export default function AdminMessageComposer({
  segments,
  capabilities,
  presetUserId,
  presetAudience,
  presetName,
}: {
  segments: SegmentOption[];
  capabilities: CapabilityOption[];
  /** Set when arriving from a partner's detail page — the note is pre-aimed at them. */
  presetUserId?: string | null;
  presetAudience?: Audience;
  presetName?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [audience, setAudience] = useState<Audience>(presetAudience ?? "USER");
  const [target, setTarget] = useState<Target>(presetUserId ? "SINGLE" : "SEGMENT");
  const [segmentKey, setSegmentKey] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<{ id: string; fullName: string; email: string | null }[]>([]);
  const [targetUserId, setTargetUserId] = useState<string | null>(presetUserId ?? null);
  const [targetUserLabel, setTargetUserLabel] = useState<string | null>(presetName ?? null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["APP"]);

  const [offerOn, setOfferOn] = useState(false);
  const [offerKind, setOfferKind] = useState<"plan" | "capability">("plan");
  const [offerPlan, setOfferPlan] = useState("PREMIUM");
  const [offerCapability, setOfferCapability] = useState(capabilities[0]?.key ?? "");
  const [offerValue, setOfferValue] = useState("true");
  const [offerDays, setOfferDays] = useState("7");

  const [preview, setPreview] = useState<Preview>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const availableSegments = segments.filter((s) => s.audience === audience);

  function payload(mode: "preview" | "send") {
    return {
      mode,
      audience,
      target,
      targetUserId: target === "SINGLE" ? targetUserId : null,
      segmentKey: target === "SEGMENT" ? segmentKey : null,
      title: title.trim(),
      body: body.trim(),
      href: href.trim() || null,
      channels,
      offerGrant: offerOn
        ? offerKind === "plan"
          ? { planCode: offerPlan, days: offerDays.trim() === "" ? null : Number(offerDays) }
          : {
              capabilityKey: offerCapability,
              value: parseCapabilityValue(offerValue),
              days: offerDays.trim() === "" ? null : Number(offerDays),
            }
        : null,
    };
  }

  async function searchUsers(q: string) {
    setUserQuery(q);
    if (q.trim().length < 3) {
      setUserResults([]);
      return;
    }
    // Reuses the entitlement panel's existing admin user search rather than
    // adding a second one that could drift from it.
    const res = await fetch(`/api/admin/entitlements?q=${encodeURIComponent(q.trim())}`);
    if (!res.ok) return;
    const json = await res.json();
    setUserResults(json.users ?? []);
  }

  async function runPreview() {
    setBusy(true);
    setPreview(null);
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload("preview")),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Preview nahi ban paya", description: json.message, tone: "error" });
        return;
      }
      setPreview({ recipientCount: json.recipientCount, withEmail: json.withEmail, withMobile: json.withMobile });
    } finally {
      setBusy(false);
    }
  }

  async function confirmSend() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload("send")),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Bheja nahi ja saka", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: `${json.sentCount} deliveries bhej di gayin`,
        description: json.failedCount > 0 ? `${json.failedCount} fail hue — history dekhein.` : undefined,
        tone: "success",
      });
      setConfirming(false);
      setPreview(null);
      setTitle("");
      setBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const formValid =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    channels.length > 0 &&
    (target !== "SEGMENT" || segmentKey !== "") &&
    (target !== "SINGLE" || targetUserId !== null);

  const audienceLabel =
    target === "ALL"
      ? `Sab ${audience === "PARTNER" ? "partners" : "members"}`
      : target === "SEGMENT"
        ? (availableSegments.find((s) => s.key === segmentKey)?.label ?? "Segment")
        : (targetUserLabel ?? "Ek user");

  return (
    <div className="flex flex-col gap-4">
      <Card variant="default" padding="lg">
        <h2 className="flex items-center gap-2 text-base font-semibold text-wine-700">
          <Users className="size-4" aria-hidden />
          Kisko bhejna hai
        </h2>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            selectSize="sm"
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value as Audience);
              setSegmentKey("");
              setPreview(null);
            }}
            options={[
              { value: "USER", label: "Members" },
              { value: "PARTNER", label: "Partners" },
            ]}
          />
          <Select
            selectSize="sm"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value as Target);
              setPreview(null);
            }}
            options={[
              { value: "SINGLE", label: "Ek hi banda" },
              { value: "SEGMENT", label: "Ek segment" },
              { value: "ALL", label: "Sab" },
            ]}
          />
        </div>

        {target === "SEGMENT" && (
          <div className="mt-2">
            <Select
              selectSize="sm"
              value={segmentKey}
              placeholder="Segment chuniye"
              onChange={(e) => {
                setSegmentKey(e.target.value);
                setPreview(null);
              }}
              options={availableSegments.map((s) => ({ value: s.key, label: s.label }))}
            />
            {segmentKey && (
              <p className="mt-1 text-xs text-subtle">
                {availableSegments.find((s) => s.key === segmentKey)?.blurb}
              </p>
            )}
          </div>
        )}

        {target === "SINGLE" && (
          <div className="mt-2">
            {targetUserId ? (
              <div className="flex items-center gap-2">
                <Pill tone="trust" size="sm">
                  {targetUserLabel}
                </Pill>
                <button
                  type="button"
                  onClick={() => {
                    setTargetUserId(null);
                    setTargetUserLabel(null);
                    setPreview(null);
                  }}
                  className="min-h-11 text-[0.8125rem] text-muted underline underline-offset-2"
                >
                  Badlein
                </button>
              </div>
            ) : (
              <>
                <Input
                  inputSize="sm"
                  placeholder="Naam, email ya mobile se dhoondhein (3+ akshar)"
                  value={userQuery}
                  onChange={(e) => searchUsers(e.target.value)}
                />
                {userResults.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-1">
                    {userResults.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setTargetUserId(u.id);
                            setTargetUserLabel(u.fullName);
                            setUserResults([]);
                            setUserQuery("");
                            setPreview(null);
                          }}
                          className="min-h-11 w-full rounded-md px-2 text-left text-[0.8125rem] text-ink hover:bg-bg-subtle"
                        >
                          {u.fullName} {u.email ? <span className="text-subtle">· {u.email}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm font-medium text-ink">Channels</p>
          <div className="mt-1 flex flex-col">
            {CHANNELS.map((c) => (
              <Checkbox
                key={c.key}
                label={c.label}
                description={c.note}
                checked={channels.includes(c.key)}
                onChange={(e) => {
                  setChannels((prev) => (e.target.checked ? [...prev, c.key] : prev.filter((x) => x !== c.key)));
                  setPreview(null);
                }}
              />
            ))}
          </div>
        </div>
      </Card>

      <Card variant="default" padding="lg">
        <h2 className="flex items-center gap-2 text-base font-semibold text-wine-700">
          <Megaphone className="size-4" aria-hidden />
          Message
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          <Input
            inputSize="sm"
            label="Title"
            maxLength={120}
            placeholder="Aapke liye ek special offer"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="text-sm font-medium text-ink">
            Message
            <textarea
              rows={4}
              maxLength={1000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Kya kehna hai — saaf aur chhota rakhein. Yahi text push notification par bhi jaayega."
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-[0.875rem] text-ink outline-none focus:border-gold-400"
            />
          </label>
          <Input
            inputSize="sm"
            label="Link (optional)"
            placeholder="/user/subscription"
            value={href}
            onChange={(e) => setHref(e.target.value)}
          />
          <p className="text-xs text-subtle">
            Push notification par yahi title aur message dikhega — lock screen koi bhi padh sakta hai, isliye kuch
            personal mat likhiye.
          </p>
        </div>
      </Card>

      <Card variant="default" padding="lg">
        <Checkbox
          checked={offerOn}
          onChange={(e) => setOfferOn(e.target.checked)}
          label={<span className="text-base font-semibold text-wine-700">Saath me ek feature bhi kholna hai?</span>}
          description="Ye sirf likha hua offer nahi rahega — har recipient ko wo access sach me mil jaayega, aur unke subscription card par 'BandhanTak team ki taraf se' dikhega."
        />

        {offerOn && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select
              selectSize="sm"
              value={offerKind}
              onChange={(e) => setOfferKind(e.target.value as "plan" | "capability")}
              options={[
                { value: "plan", label: "Poora plan" },
                { value: "capability", label: "Ek feature" },
              ]}
            />
            {offerKind === "plan" ? (
              <Select
                selectSize="sm"
                value={offerPlan}
                onChange={(e) => setOfferPlan(e.target.value)}
                options={[
                  { value: "BASIC", label: "Basic" },
                  { value: "STANDARD", label: "Standard" },
                  { value: "PREMIUM", label: "Premium" },
                ]}
              />
            ) : (
              <>
                <Select
                  selectSize="sm"
                  value={offerCapability}
                  onChange={(e) => setOfferCapability(e.target.value)}
                  options={capabilities.map((c) => ({ value: c.key, label: c.label }))}
                />
                <Input
                  inputSize="sm"
                  placeholder="true / 20 / null"
                  value={offerValue}
                  onChange={(e) => setOfferValue(e.target.value)}
                  aria-label="Value"
                />
              </>
            )}
            <Input
              inputSize="sm"
              type="number"
              min={1}
              max={365}
              placeholder="Din (khaali = hamesha)"
              value={offerDays}
              onChange={(e) => setOfferDays(e.target.value)}
              aria-label="Kitne din"
            />
          </div>
        )}
      </Card>

      <Card variant="soft" padding="lg">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="secondary" disabled={!formValid || busy} onClick={runPreview}>
            Check Recipients
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!formValid || preview === null || preview.recipientCount === 0 || busy}
            onClick={() => setConfirming(true)}
          >
            <Send className="size-4" aria-hidden />
            Send
          </Button>
        </div>

        {preview ? (
          <p className="mt-3 text-sm text-ink">
            <strong>{preview.recipientCount}</strong> log milenge — {preview.withEmail} ke paas email,{" "}
            {preview.withMobile} ke paas mobile.
            {channels.includes("EMAIL") && preview.withEmail < preview.recipientCount && (
              <span className="text-muted"> Email sirf {preview.withEmail} ko jaayega.</span>
            )}
          </p>
        ) : (
          <p className="mt-3 text-[0.8125rem] text-muted">
            Send tab tak band hai jab tak aap dekh na lein ki kitne logon ko jaa raha hai.
          </p>
        )}
      </Card>

      <AdminActionConfirmModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={confirmSend}
        title="Message bhej dein?"
        description="Bheja hua message wapas nahi liya ja sakta. Push notification turant pahunch jaayega."
        details={[
          { label: "Kisko", value: `${audienceLabel} — ${preview?.recipientCount ?? 0} log` },
          { label: "Channels", value: channels.join(", ") },
          { label: "Title", value: title.trim() },
          ...(offerOn
            ? [
                {
                  label: "Feature bhi milega",
                  value:
                    offerKind === "plan"
                      ? `${offerPlan}${offerDays ? ` (${offerDays} din)` : " (hamesha)"}`
                      : `${offerCapability} = ${offerValue}`,
                },
              ]
            : []),
        ]}
        confirmLabel="Yes, Send"
      />
    </div>
  );
}

/** The admin types a raw scalar; the server re-validates it against the capability's declared type. */
function parseCapabilityValue(raw: string): boolean | number | null {
  const t = raw.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null" || t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
