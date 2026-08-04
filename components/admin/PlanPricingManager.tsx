"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IndianRupee } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import AdminActionConfirmModal from "@/components/admin/AdminActionConfirmModal";
import { paiseToRupees } from "@/lib/utils/money";
import { MIN_PLAN_PRICE_RUPEES, MAX_PLAN_PRICE_RUPEES, MIN_COMMISSION_RUPEES, MAX_COMMISSION_RUPEES } from "@/lib/services/plans/constants";

export type AdminPlanRow = {
  code: string;
  name: string;
  priceInPaise: number;
  durationLabel: string;
  featureBullets: string[];
};

type PendingSave =
  | { kind: "plan"; code: string; name: string; nextRupees: number; prevRupees: number }
  | { kind: "commission"; nextRupees: number; prevRupees: number }
  | null;

export default function PlanPricingManager({
  plans,
  commissionPaise,
}: {
  plans: AdminPlanRow[];
  commissionPaise: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(plans.map((p) => [p.code, String(paiseToRupees(p.priceInPaise))])),
  );
  const [commissionDraft, setCommissionDraft] = useState(String(paiseToRupees(commissionPaise)));
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
              body: JSON.stringify({ amountRupees: pending.nextRupees }),
            });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Save fail hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: pending.kind === "plan" ? `${pending.name} ka price update ho gaya` : "Commission rate update ho gaya",
        description: `₹${pending.prevRupees} → ₹${pending.nextRupees}`,
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
            Ye rate har plan aur har renewal par flat lagu hota hai — plan ke hisaab se alag nahi (D-12).
          </p>
          {(() => {
            const currentRupees = paiseToRupees(commissionPaise);
            const draftNum = Number(commissionDraft);
            const valid =
              Number.isFinite(draftNum) && draftNum >= MIN_COMMISSION_RUPEES && draftNum <= MAX_COMMISSION_RUPEES;
            const dirty = draftNum !== currentRupees;
            return (
              <div className="mt-3 flex items-end gap-2">
                <Input
                  inputSize="sm"
                  type="number"
                  min={MIN_COMMISSION_RUPEES}
                  max={MAX_COMMISSION_RUPEES}
                  prefix={<IndianRupee />}
                  value={commissionDraft}
                  onChange={(e) => setCommissionDraft(e.target.value)}
                  className="max-w-32"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!valid || !dirty || busy}
                  onClick={() => setPending({ kind: "commission", nextRupees: draftNum, prevRupees: currentRupees })}
                >
                  Save
                </Button>
              </div>
            );
          })()}
        </Card>
      </section>

      <AdminActionConfirmModal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirmSave}
        title={pending?.kind === "plan" ? `${pending.name} ka price badlein?` : "Commission rate badlein?"}
        description="Ye badlaav turant sabhi jagah (pricing page, home, partner program) dikhega."
        details={pending ? [{ label: "Naya amount", value: `₹${pending.nextRupees}` }] : []}
        confirmLabel="Haan, save karein"
      />
    </div>
  );
}
