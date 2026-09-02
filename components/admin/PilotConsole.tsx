"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Users } from "lucide-react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import type { DemandHotspot, PilotCityRow } from "@/lib/services/pilot/pilotCityService";
import type { SlaEscalationRow } from "@/lib/services/marketplace/slaJob";
import type { OpsSettingsValues } from "@/lib/services/pilot/opsSettings";

/**
 * Where BandhanTak is open, how full each city is, and how hard the platform
 * chases work that has gone quiet.
 *
 * ## Why cities and chase timings share a screen
 *
 * They are the same job on the same day. Opening a city means deciding how many
 * partners it carries *and* being able to see, that afternoon, whether those
 * partners are answering — and the moment those two live on separate screens,
 * the second one stops being opened.
 *
 * ## Why there is no "approve anyway"
 *
 * A full city refuses a new listing, and the only way past it is to raise the
 * capacity — one field, on this screen, in the audit log. An override button
 * would be faster and would leave nothing behind, which is exactly how a cap
 * quietly stops meaning anything.
 */

export interface PilotConsoleState {
  cities: PilotCityRow[];
  hotspots: DemandHotspot[];
  escalations: SlaEscalationRow[];
  settings: OpsSettingsValues;
}

const STATUS_LABEL: Record<PilotCityRow["status"], string> = {
  OPEN: "Khula",
  WAITLIST: "Waitlist",
  PAUSED: "Ruka hua",
};

const STATUS_TONE: Record<PilotCityRow["status"], string> = {
  OPEN: "border-trust/30 bg-trust-bg text-trust",
  WAITLIST: "border-line bg-bg-subtle text-muted",
  PAUSED: "border-wine-200 bg-wine-50 text-wine-700 dark:border-wine-900/40 dark:bg-wine-900/20 dark:text-wine-300",
};

export default function PilotConsole({ initial }: { initial: PilotConsoleState }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Only the half of a row somebody is typing into is local state.
   *
   * The counts — listed, queued, waiting — are read straight from the server's
   * props on every render, so a `router.refresh()` after a save updates them.
   * Copying them into state at mount (which is what this screen did first) left
   * a row reading "12/12 listed" for the rest of the session after the capacity
   * had already been raised to 20.
   */
  const [edits, setEdits] = useState<Record<string, { capacity: string; note: string }>>({});

  function editFor(city: PilotCityRow) {
    return edits[city.id] ?? { capacity: String(city.partnerCapacity), note: city.note ?? "" };
  }

  function setEdit(city: PilotCityRow, patch: Partial<{ capacity: string; note: string }>) {
    setEdits((prev) => ({ ...prev, [city.id]: { ...editFor(city), ...patch } }));
  }

  const cities = initial.cities;
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [settings, setSettings] = useState(initial.settings);

  async function send(key: string, body: Record<string, unknown>, successNote?: string) {
    if (busy) return;
    setBusy(key);
    try {
      const res = await fetch("/api/admin/pilot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; notified?: number };
      if (!res.ok) {
        toast({ title: "Nahi ho paya", description: json?.message ?? "Dobara try karein.", tone: "error" });
        return false;
      }
      toast({
        title: "Save ho gaya",
        description:
          json.notified && json.notified > 0
            ? `${json.notified} log jo is sheher ka intezaar kar rahe the, unhe bata diya.`
            : successNote,
        tone: "success",
      });
      router.refresh();
      return true;
    } catch {
      toast({ title: "Network error", tone: "error" });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function addCity(city: string, state: string) {
    const ok = await send("add", { action: "add-city", city, state });
    if (ok) {
      setNewCity("");
      setNewState("");
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ---------------- Cities ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Pilot ke sheher</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Sirf <strong>Khula</strong> sheher me nayi listing approve hoti hai. Sheher bhar jaane par approval ruk
          jaata hai — aage badhna hai to capacity badhaiye, wahi is cap ka override hai aur wo audit log me jaata
          hai.
        </p>

        {cities.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
            Abhi koi sheher list me nahi hai — jab tak koi nahi hai, capacity kahin nahi lagti aur har listing
            approve ho sakti hai.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {cities.map((c) => (
              <li key={c.id} className="rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                    <MapPin className="size-3.5 text-muted" aria-hidden />
                    {c.city}
                  </span>
                  <span className="text-[0.75rem] text-muted">{c.state}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium ${STATUS_TONE[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                  <span className="ml-auto text-[0.75rem] tabular-nums text-muted">
                    {c.listedPartners}/{c.partnerCapacity} listed
                    {c.pendingListings > 0 && ` · ${c.pendingListings} queue me`}
                    {c.waiting > 0 && ` · ${c.waiting} log intezaar me`}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-[0.6875rem] text-muted">
                    Status
                    <select
                      value={c.status}
                      // No optimistic flip: the select keeps showing the stored
                      // status until the server agrees, so a save that failed
                      // never leaves a city *reading* open when it is not.
                      onChange={(e) =>
                        void send(`status-${c.id}`, {
                          action: "update-city",
                          id: c.id,
                          status: e.target.value as PilotCityRow["status"],
                        })
                      }
                      className="mt-0.5 block min-h-9 rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-gold-500"
                    >
                      <option value="OPEN">Khula</option>
                      <option value="WAITLIST">Waitlist</option>
                      <option value="PAUSED">Ruka hua</option>
                    </select>
                  </label>

                  <label className="text-[0.6875rem] text-muted">
                    Kitne partner
                    <input
                      inputMode="numeric"
                      value={editFor(c).capacity}
                      onChange={(e) => setEdit(c, { capacity: e.target.value })}
                      className="mt-0.5 block min-h-9 w-24 rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-gold-500"
                    />
                  </label>

                  <label className="min-w-48 flex-1 text-[0.6875rem] text-muted">
                    Note — partner aur buyer dono ko dikhega
                    <input
                      value={editFor(c).note}
                      maxLength={300}
                      onChange={(e) => setEdit(c, { note: e.target.value })}
                      className="mt-0.5 block min-h-9 w-full rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-gold-500"
                    />
                  </label>

                  <SaveButton
                    busy={busy === `city-${c.id}`}
                    onClick={() =>
                      send(`city-${c.id}`, {
                        action: "update-city",
                        id: c.id,
                        partnerCapacity: Number(editFor(c).capacity),
                        note: editFor(c).note.trim() || null,
                      })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line/60 pt-4">
          <label className="text-[0.6875rem] text-muted">
            Naya sheher
            <input
              value={newCity}
              maxLength={100}
              onChange={(e) => setNewCity(e.target.value)}
              className="mt-0.5 block min-h-9 w-40 rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-gold-500"
            />
          </label>
          <label className="text-[0.6875rem] text-muted">
            Rajya
            <input
              value={newState}
              maxLength={100}
              onChange={(e) => setNewState(e.target.value)}
              className="mt-0.5 block min-h-9 w-40 rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm outline-none focus:border-gold-500"
            />
          </label>
          <button
            type="button"
            disabled={busy !== null || newCity.trim().length === 0 || newState.trim().length === 0}
            onClick={() => addCity(newCity.trim(), newState.trim())}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-ink hover:border-gold-500 disabled:opacity-55"
          >
            {busy === "add" && <Loader2 className="size-3.5 animate-spin" />}
            Waitlist par jodiye
          </button>
          <p className="w-full text-[0.6875rem] leading-relaxed text-muted">
            Naya sheher waitlist se shuru hota hai — capacity {settings.defaultCityPartnerCapacity} se. Khula karte
            hi jo log wahan ka intezaar kar rahe the, unhe khud bata diya jayega.
          </p>
        </div>
      </Card>

      {/* ---------------- Demand ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Log kahan maang rahe hain</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Har wo shakhs jise uske sheher me koi partner nahi mila. {settings.demandSignalThreshold} ya usse zyada
          matlab agla sheher yahi ho sakta hai.
        </p>

        {initial.hotspots.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
            Abhi kisi ne aise sheher ke liye nahi poocha jahan hum nahi hain.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {initial.hotspots.map((h) => (
              <li
                key={h.citySlug}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line/70 bg-surface-2 px-3 py-2"
              >
                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                  <Users className="size-3.5 text-muted" aria-hidden />
                  {h.city}
                </span>
                {h.state && <span className="text-[0.75rem] text-muted">{h.state}</span>}
                <span
                  className={`text-[0.75rem] tabular-nums ${
                    h.waiting >= settings.demandSignalThreshold ? "font-semibold text-gold-700" : "text-muted"
                  }`}
                >
                  {h.waiting} log intezaar me
                </span>
                {!h.known && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => addCity(h.city, h.state ?? "")}
                    className="ml-auto inline-flex min-h-8 items-center rounded-md border border-line px-2.5 text-[0.6875rem] font-medium text-ink hover:border-gold-500 disabled:opacity-55"
                  >
                    List me jodiye
                  </button>
                )}
                {h.known && h.status !== "OPEN" && (
                  <span className="ml-auto text-[0.6875rem] text-muted">{STATUS_LABEL[h.status!]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------------- SLA escalations ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Jinhone jawab nahi diya</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Pichhle {settings.slaBreachWindowDays} din me {settings.slaBreachEscalationCount} ya usse zyada booking
          jinhone tay time me accept nahi ki. Har aisi booking ka poora paisa buyer ko apne aap wapas ja chuka hai —
          ye list unke liye hai jinse ab baat karni chahiye.
        </p>

        {initial.escalations.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
            Kisi partner ne itni baar miss nahi kiya. Achhi khabar hai.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {initial.escalations.map((e) => (
              <li
                key={e.partnerId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line/70 bg-surface-2 px-3 py-2"
              >
                <a href={`/admin/partners/${e.partnerId}`} className="font-medium text-ink underline-offset-2 hover:underline">
                  {e.partnerName}
                </a>
                <span className="text-[0.75rem] text-muted">{e.city}</span>
                <span className="text-[0.75rem] font-semibold tabular-nums text-wine-700 dark:text-wine-300">
                  {e.misses} miss
                </span>
                <span className="text-[0.75rem] text-muted">
                  aakhri: {new Date(e.lastMissAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
                <span className="ml-auto text-[0.6875rem] text-muted">
                  {e.autoPausedAt
                    ? e.acceptingBookings
                      ? "rok lagi thi, khud wapas chaalu kar liya"
                      : "nayi booking rok di gayi hai"
                    : "abhi bhi booking le rahe hain"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------------- Chase timings ---------------- */}
      <Card variant="default" padding="lg">
        <h2 className="text-base font-semibold text-wine-700">Kaun kis par lagega</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
          Ye ghante aur ginti tay karte hain ki ruki hui booking par kaun, kab peechhe padega. Paise ke number
          yahan nahi hain — wo <span className="font-medium text-ink">Pricing</span> par hain.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Dial
            label="Pehla reminder (ghante bache hue)"
            hint="Accept ka clock itna bacha ho tab partner ko pehli baar yaad dilate hain."
            value={settings.slaFirstReminderHours}
            busy={busy === "slaFirstReminderHours"}
            onSave={(v) => send("slaFirstReminderHours", { action: "settings", slaFirstReminderHours: v })}
            onChange={(v) => setSettings({ ...settings, slaFirstReminderHours: v })}
          />
          <Dial
            label="Aakhri reminder (ghante bache hue)"
            hint="Aakhri chetavni. Pehle reminder se kam hona chahiye."
            value={settings.slaFinalReminderHours}
            busy={busy === "slaFinalReminderHours"}
            onSave={(v) => send("slaFinalReminderHours", { action: "settings", slaFinalReminderHours: v })}
            onChange={(v) => setSettings({ ...settings, slaFinalReminderHours: v })}
          />
          <Dial
            label="Buyer ko yaad dilana (ghante)"
            hint="Refund window band hone se itni der pehle buyer ko batate hain."
            value={settings.ackReminderHours}
            busy={busy === "ackReminderHours"}
            onSave={(v) => send("ackReminderHours", { action: "settings", ackReminderHours: v })}
            onChange={(v) => setSettings({ ...settings, ackReminderHours: v })}
          />
          <Dial
            label="Milestone ki chhoot (din)"
            hint="Due date nikalne ke itne din baad partner se poochte hain."
            value={settings.milestoneOverdueGraceDays}
            busy={busy === "milestoneOverdueGraceDays"}
            onSave={(v) => send("milestoneOverdueGraceDays", { action: "settings", milestoneOverdueGraceDays: v })}
            onChange={(v) => setSettings({ ...settings, milestoneOverdueGraceDays: v })}
          />
          <Dial
            label="Kitne miss par escalation"
            hint="Itni baar accept ka time nikal gaya to admin ko batate hain."
            value={settings.slaBreachEscalationCount}
            busy={busy === "slaBreachEscalationCount"}
            onSave={(v) => send("slaBreachEscalationCount", { action: "settings", slaBreachEscalationCount: v })}
            onChange={(v) => setSettings({ ...settings, slaBreachEscalationCount: v })}
          />
          <Dial
            label="Ginti ka window (din)"
            hint="Itne din ke andar ke miss gine jaate hain."
            value={settings.slaBreachWindowDays}
            busy={busy === "slaBreachWindowDays"}
            onSave={(v) => send("slaBreachWindowDays", { action: "settings", slaBreachWindowDays: v })}
            onChange={(v) => setSettings({ ...settings, slaBreachWindowDays: v })}
          />
          <Dial
            label="Safety ka pehla jawab (ghante)"
            hint="Safety case itni der tak kisi ne nahi uthaya to wo escalate hota hai."
            value={settings.safetyFirstResponseHours}
            busy={busy === "safetyFirstResponseHours"}
            onSave={(v) => send("safetyFirstResponseHours", { action: "settings", safetyFirstResponseHours: v })}
            onChange={(v) => setSettings({ ...settings, safetyFirstResponseHours: v })}
          />
          <Dial
            label="Naye sheher ki capacity"
            hint="Naya sheher jodte waqt default. Baad me har sheher ka apna number."
            value={settings.defaultCityPartnerCapacity}
            busy={busy === "defaultCityPartnerCapacity"}
            onSave={(v) => send("defaultCityPartnerCapacity", { action: "settings", defaultCityPartnerCapacity: v })}
            onChange={(v) => setSettings({ ...settings, defaultCityPartnerCapacity: v })}
          />
          <Dial
            label="Demand ka threshold"
            hint="Itne log ek sheher se maang lein to wo 'yahan kholiye' me upar aata hai."
            value={settings.demandSignalThreshold}
            busy={busy === "demandSignalThreshold"}
            onSave={(v) => send("demandSignalThreshold", { action: "settings", demandSignalThreshold: v })}
            onChange={(v) => setSettings({ ...settings, demandSignalThreshold: v })}
          />
        </div>

        <label className="mt-4 flex items-start gap-2.5 rounded-md border border-line/70 bg-surface-2 px-3 py-2.5">
          <input
            type="checkbox"
            checked={settings.slaAutoPauseOnEscalation}
            onChange={(e) => {
              setSettings({ ...settings, slaAutoPauseOnEscalation: e.target.checked });
              void send("autopause", { action: "settings", slaAutoPauseOnEscalation: e.target.checked });
            }}
            className="mt-0.5 size-4 accent-[var(--color-gold-600)]"
          />
          <span className="text-[0.8125rem] leading-relaxed text-ink">
            Escalation par partner ki nayi booking rok dijiye
            <span className="mt-0.5 block text-[0.6875rem] text-muted">
              Band karne par bhi partner khud wapas chaalu kar sakta hai — ye saza nahi, buyer ko bachane wali brake
              hai. Record dono soorat me rehta hai.
            </span>
          </span>
        </label>
      </Card>
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
