"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IndianRupee, Percent } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import { paiseToRupees, paiseToRupeeDisplay } from "@/lib/utils/money";
import { applyBps, bpsToPercentDisplay } from "@/lib/partner/tier";
import {
  MIN_PLAN_PRICE_RUPEES,
  MAX_PLAN_PRICE_RUPEES,
  MIN_COMMISSION_BPS,
  MAX_COMMISSION_BPS,
  MIN_TIER_BONUS_BPS,
  MAX_TIER_BONUS_BPS,
  MIN_TIER_THRESHOLD,
  MAX_TIER_THRESHOLD,
} from "@/lib/services/plans/constants";

export type AdminPlanRow = {
  code: string;
  name: string;
  priceInPaise: number;
  durationLabel: string;
  featureBullets: string[];
};

export type AdminCommissionConfig = {
  baseBps: number;
  silverBonusBps: number;
  goldBonusBps: number;
  silverThreshold: number;
  goldThreshold: number;
};

/** Which commission control is being edited — the API patches one field at a time. */
type CommissionControl = keyof AdminCommissionConfig;

type PendingSave =
  | { kind: "plan"; code: string; name: string; nextRupees: number; prevRupees: number }
  | { kind: "commission"; field: CommissionControl; label: string; next: number; prev: number; unit: "%" | "" }
  | null;

/** Percent in the UI, basis points on the wire — nobody should type "1250" to mean 12.5%. */
const PERCENT_FIELDS: CommissionControl[] = ["baseBps", "silverBonusBps", "goldBonusBps"];

const FIELD_PAYLOAD_KEY: Record<CommissionControl, string> = {
  baseBps: "basePercent",
  silverBonusBps: "silverBonusPercent",
  goldBonusBps: "goldBonusPercent",
  silverThreshold: "silverThreshold",
  goldThreshold: "goldThreshold",
};

export default function PlanPricingManager({
  plans,
  commission,
  topPlanPaise,
}: {
  plans: AdminPlanRow[];
  commission: AdminCommissionConfig;
  /** Priciest active plan — drives the "is se kitna banta hai" preview. */
  topPlanPaise: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(plans.map((p) => [p.code, String(paiseToRupees(p.priceInPaise))])),
  );
  const [commissionDrafts, setCommissionDrafts] = useState<Record<CommissionControl, string>>({
    baseBps: String(commission.baseBps / 100),
    silverBonusBps: String(commission.silverBonusBps / 100),
    goldBonusBps: String(commission.goldBonusBps / 100),
    silverThreshold: String(commission.silverThreshold),
    goldThreshold: String(commission.goldThreshold),
  });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingSave>(null);

  async function confirmSave() {
    if (!pending) return;
    setBusy(true);
    try {
      const res =
        pending.kind === "plan"
          ? await fetch(`/api/admin/plans/${pending.code}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ priceRupees: pending.nextRupees }),
            })
          : await fetch("/api/admin/commission-rate", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ [FIELD_PAYLOAD_KEY[pending.field]]: pending.next }),
            });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: pending.kind === "plan" ? `${pending.name} ka price update ho gaya` : `${pending.label} update ho gaya`,
        description:
          pending.kind === "plan"
            ? `₹${pending.prevRupees} → ₹${pending.nextRupees}`
            : `${pending.prev}${pending.unit} → ${pending.next}${pending.unit}`,
        tone: "success",
      });
      setPending(null);
      router.refresh();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  /** One editor, five controls — they differ only in range, unit and label. */
  function CommissionControl({ field, label, hint }: { field: CommissionControl; label: string; hint: string }) {
    const isPercent = PERCENT_FIELDS.includes(field);
    const current = isPercent ? commission[field] / 100 : commission[field];
    const draft = commissionDrafts[field];
    const draftNum = Number(draft);
    const min = isPercent
      ? (field === "baseBps" ? MIN_COMMISSION_BPS : MIN_TIER_BONUS_BPS) / 100
      : MIN_TIER_THRESHOLD;
    const max = isPercent
      ? (field === "baseBps" ? MAX_COMMISSION_BPS : MAX_TIER_BONUS_BPS) / 100
      : MAX_TIER_THRESHOLD;
    const valid =
      Number.isFinite(draftNum) && draftNum >= min && draftNum <= max && (isPercent || Number.isInteger(draftNum));
    const dirty = draftNum !== current;

    return (
      <div>
        <label className="text-sm font-semibold text-ink">{label}</label>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
        <div className="mt-2 flex items-end gap-2">
          <Input
            inputSize="sm"
            type="number"
            min={min}
            max={max}
            step={isPercent ? 0.5 : 1}
            prefix={isPercent ? <Percent /> : undefined}
            value={draft}
            onChange={(e) => setCommissionDrafts((d) => ({ ...d, [field]: e.target.value }))}
            className="max-w-28"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!valid || !dirty || busy}
            onClick={() =>
              setPending({
                kind: "commission",
                field,
                label,
                next: draftNum,
                prev: current,
                unit: isPercent ? "%" : "",
              })
            }
          >
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Subscription Plans</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {plans.map((plan) => {
            const isFree = plan.code === "FREE";
            const currentRupees = paiseToRupees(plan.priceInPaise);
            const draft = drafts[plan.code] ?? String(currentRupees);
            const draftNum = Number(draft);
            const valid =
              !isFree &&
              Number.isFinite(draftNum) &&
              draftNum >= MIN_PLAN_PRICE_RUPEES &&
              draftNum <= MAX_PLAN_PRICE_RUPEES;
            const dirty = draftNum !== currentRupees;

            return (
              <Card key={plan.code} variant="soft" padding="md">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-ink">{plan.name}</h3>
                  <span className="text-xs text-muted">{plan.durationLabel}</span>
                </div>

                {isFree ? (
                  <p className="mt-3 text-2xl font-bold text-wine-700">₹0 · Free</p>
                ) : (
                  <div className="mt-3 flex items-end gap-2">
                    <Input
                      inputSize="sm"
                      type="number"
                      min={MIN_PLAN_PRICE_RUPEES}
                      max={MAX_PLAN_PRICE_RUPEES}
                      prefix={<IndianRupee />}
                      value={draft}
                      onChange={(e) => setDrafts((d) => ({ ...d, [plan.code]: e.target.value }))}
                      className="max-w-32"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!valid || !dirty || busy}
                      onClick={() =>
                        setPending({ kind: "plan", code: plan.code, name: plan.name, nextRupees: draftNum, prevRupees: currentRupees })
                      }
                    >
                      Save
                    </Button>
                  </div>
                )}

                <ul className="mt-3 flex flex-col gap-1">
                  {plan.featureBullets.map((f) => (
                    <li key={f} className="text-xs text-muted">
                      ✓ {f}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Partner Commission</h2>
        <Card variant="soft" padding="md">
          <p className="text-sm text-muted">
            Commission member ne jitna <strong>actually pay kiya</strong> uska percentage hai — har plan par same
            rate, har renewal par bhi. Plan ke hisaab se alag slab nahi hote (D-12). Sirf partner ka apna tier rate
            badha sakta hai.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <CommissionControl
              field="baseBps"
              label="Base rate (Bronze)"
              hint="Har naye partner ko yahi milta hai."
            />
            <CommissionControl
              field="silverBonusBps"
              label="Silver bonus"
              hint="Base ke upar extra."
            />
            <CommissionControl field="goldBonusBps" label="Gold bonus" hint="Base ke upar extra." />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CommissionControl
              field="silverThreshold"
              label="Silver threshold"
              hint="Itne logon ne plan liya to Silver."
            />
            <CommissionControl
              field="goldThreshold"
              label="Gold threshold"
              hint="Itne logon ne plan liya to Gold."
            />
          </div>

          {/* An abstract "10% + 2%" is hard to sanity-check; the same thing as
              rupees off the priciest plan is not. */}
          <div className="mt-5 rounded-lg border border-line bg-surface p-3">
            <p className="text-xs font-semibold text-ink">
              {paiseToRupeeDisplay(topPlanPaise)} ke plan par partner ko kitna milega
            </p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted">
              {(
                [
                  ["Bronze", commission.baseBps],
                  ["Silver", commission.baseBps + commission.silverBonusBps],
                  ["Gold", commission.baseBps + commission.goldBonusBps],
                ] as const
              ).map(([tier, bps]) => (
                <span key={tier}>
                  {tier}: <strong className="text-ink">{paiseToRupeeDisplay(applyBps(topPlanPaise, bps))}</strong>{" "}
                  ({bpsToPercentDisplay(bps)})
                </span>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <AdminActionConfirmModal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirmSave}
        title={pending?.kind === "plan" ? `${pending.name} ka price badlein?` : `${pending?.label} badlein?`}
        description={
          pending?.kind === "commission"
            ? "Ye sirf aage aane wale payments par lagega — jo commission ban chuki hain wo apne purane rate par hi rahengi."
            : "Ye badlaav turant sabhi jagah (pricing page, home, partner program) dikhega."
        }
        details={
          pending
            ? [
                {
                  label: "Naya",
                  value:
                    pending.kind === "plan" ? `₹${pending.nextRupees}` : `${pending.next}${pending.unit}`,
                },
              ]
            : []
        }
        confirmLabel="Yes, Save"
      />
    </div>
  );
}
