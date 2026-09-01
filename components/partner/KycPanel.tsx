"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, FileCheck2, FileUp, Loader2, ShieldAlert } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Pill from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";

export type KycDocKind = "PAN_CARD" | "ID_PROOF" | "BANK_PROOF";

export type KycPanelDocument = {
  id: string;
  kind: KycDocKind;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  uploadedAt: string;
  rejectionNote: string | null;
};

export type KycPanelState = {
  status: "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";
  legalName: string | null;
  panMasked: string | null;
  panOnFile: boolean;
  rejectionNote: string | null;
  documents: KycPanelDocument[];
  /** False when the deployment has `requireKycForPayout` off — then this is optional. */
  required: boolean;
};

const DOC_LABEL: Record<KycDocKind, { title: string; hint: string; required: boolean }> = {
  PAN_CARD: {
    title: "PAN card ki photo",
    hint: "Naam aur number saaf dikhna chahiye",
    required: true,
  },
  ID_PROOF: {
    title: "Koi ek ID (optional)",
    hint: "Aadhaar, DL, voter id ya passport",
    required: false,
  },
  BANK_PROOF: {
    title: "Bank proof (optional)",
    hint: "Cancelled cheque, passbook page, ya UPI app ka screenshot",
    required: false,
  },
};

const ORDER: KycDocKind[] = ["PAN_CARD", "ID_PROOF", "BANK_PROOF"];

/**
 * The identity step, in one card.
 *
 * ## Why it is one card and not a wizard
 *
 * The whole ask is a number, a name, and one photo. A multi-step flow would
 * make that feel like a bank onboarding, and every extra screen is a place a
 * partner stops. Everything is visible at once, the optional uploads are
 * labelled optional, and nothing here blocks the partner from filling in their
 * bank details first — the gate lives at withdrawal, not at data entry.
 *
 * ## What is never shown
 *
 * A stored PAN. The server returns only the last four and this component has
 * no way to ask for more — the same rule `PayoutAccountForm` follows for an
 * account number. What was typed is cleared out of React state the moment it
 * is saved.
 */
export default function KycPanel({ state }: { state: KycPanelState }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();

  const [editingPan, setEditingPan] = useState(!state.panOnFile);
  const [pan, setPan] = useState("");
  const [legalName, setLegalName] = useState(state.legalName ?? "");
  const [savingPan, setSavingPan] = useState(false);
  const [uploading, setUploading] = useState<KycDocKind | null>(null);

  const fileInputs = {
    PAN_CARD: useRef<HTMLInputElement>(null),
    ID_PROOF: useRef<HTMLInputElement>(null),
    BANK_PROOF: useRef<HTMLInputElement>(null),
  };

  const panValid = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(pan.trim()) && legalName.trim().length >= 2;

  async function savePan() {
    setSavingPan(true);
    try {
      const res = await fetch("/api/partner/kyc/pan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pan: pan.trim(), legalName: legalName.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("partner.kyc.saveError", "Save nahi hua"), description: json.message, tone: "error" });
        return;
      }
      // No reason for a PAN to sit in React state once it has been stored.
      setPan("");
      setEditingPan(false);
      toast({
        title: t("partner.kyc.saveSuccessTitle", "PAN save ho gaya"),
        description: t("partner.kyc.saveSuccessDesc", "Ab PAN card ki photo bhejiye."),
        tone: "success",
      });
      router.refresh();
    } finally {
      setSavingPan(false);
    }
  }

  async function upload(kind: KycDocKind, file: File) {
    setUploading(kind);
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      const res = await fetch("/api/partner/kyc/document", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: t("partner.kyc.uploadError", "Upload nahi hua"), description: json.message, tone: "error" });
        return;
      }
      toast({
        title: t("partner.kyc.uploadSuccessTitle", "File mil gayi"),
        description: t("partner.kyc.uploadSuccessDesc", "Admin check karega, phir verify ho jaayega."),
        tone: "success",
      });
      router.refresh();
    } finally {
      setUploading(null);
      // Cleared so picking the *same* file again still fires `onChange` — a
      // partner re-uploading after a rejection usually picks the same photo.
      const input = fileInputs[kind].current;
      if (input) input.value = "";
    }
  }

  const byKind = new Map(state.documents.map((d) => [d.kind, d]));
  const verified = state.status === "VERIFIED";

  return (
    <Card variant="default" padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-wine-700">
            {t("partner.kyc.title", "Aapki pehchaan")}
          </h2>
          <p className="mt-1 text-[0.8125rem] text-muted">
            {t(
              "partner.kyc.subtitle",
              "Paisa sahi insaan ko jaaye, iske liye ek baar PAN chahiye. Sab kuch encrypted rehta hai.",
            )}
          </p>
        </div>
        <Pill
          tone={verified ? "trust" : state.status === "REJECTED" ? "danger" : "gold"}
          size="sm"
        >
          {verified
            ? t("partner.kyc.verified", "Verified")
            : state.status === "PENDING"
              ? t("partner.kyc.pending", "Check ho raha hai")
              : state.status === "REJECTED"
                ? t("partner.kyc.rejected", "Dobara bhejein")
                : state.required
                  ? t("partner.kyc.notStarted", "Zaroori hai")
                  : t("partner.kyc.optional", "Optional")}
        </Pill>
      </div>

      {state.rejectionNote && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <p className="text-[0.8125rem] text-danger">{state.rejectionNote}</p>
        </div>
      )}

      {/* ---------------------------------------------------------- PAN */}
      <div className="mt-4 border-t border-line pt-4">
        {state.panOnFile && !editingPan ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <FileCheck2 className="size-5 text-trust" aria-hidden />
              <div>
                <p className="font-medium text-ink">
                  {state.legalName} · <span className="font-mono">{state.panMasked}</span>
                </p>
                <p className="text-[0.8125rem] text-muted">
                  {t("partner.kyc.panOnFile", "PAN card par jo naam hai")}
                </p>
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setEditingPan(true)}>
              {t("partner.kyc.change", "Change")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              inputSize="sm"
              label={t("partner.kyc.panLabel", "PAN number")}
              placeholder="ABCDE1234F"
              autoComplete="off"
              maxLength={10}
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
            />
            <Input
              inputSize="sm"
              label={t("partner.kyc.legalNameLabel", "PAN card par likha naam")}
              placeholder={t("partner.kyc.legalNamePlaceholder", "Bilkul waisa hi jaisa card par hai")}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
            />
            <div className="mt-1 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={!panValid || savingPan} loading={savingPan} onClick={savePan}>
                {t("partner.kyc.savePan", "PAN Save Karein")}
              </Button>
              {state.panOnFile && (
                <Button size="sm" variant="ghost" disabled={savingPan} onClick={() => setEditingPan(false)}>
                  {t("partner.kyc.cancel", "Cancel")}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- documents */}
      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        {ORDER.map((kind) => {
          const doc = byKind.get(kind);
          const meta = DOC_LABEL[kind];
          const busy = uploading === kind;
          return (
            <div
              key={kind}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[0.875rem] font-medium text-ink">
                  {t(`partner.kyc.doc.${kind}.title`, meta.title)}
                  {meta.required && state.required && <span className="ml-1 text-danger">*</span>}
                </p>
                <p className="text-xs text-muted">
                  {doc
                    ? doc.status === "REJECTED"
                      ? (doc.rejectionNote ?? t("partner.kyc.docRejected", "Dobara bhejein"))
                      : t("partner.kyc.docOnFile", "Mil gayi")
                    : t(`partner.kyc.doc.${kind}.hint`, meta.hint)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {doc && doc.status !== "REJECTED" && (
                  <Pill tone={doc.status === "VERIFIED" ? "trust" : "gold"} size="sm">
                    {doc.status === "VERIFIED"
                      ? t("partner.kyc.docVerified", "Verified")
                      : t("partner.kyc.docPending", "Check ho rahi")}
                  </Pill>
                )}
                <input
                  ref={fileInputs[kind]}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(kind, file);
                  }}
                />
                <Button
                  size="sm"
                  variant={doc ? "ghost" : "secondary"}
                  disabled={busy}
                  onClick={() => fileInputs[kind].current?.click()}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <FileUp className="size-4" aria-hidden />
                  )}
                  <span className="ml-1.5">
                    {doc ? t("partner.kyc.replace", "Badlein") : t("partner.kyc.upload", "Bhejein")}
                  </span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-subtle">
        <BadgeCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t(
          "partner.kyc.footerNote",
          "Documents sirf admin dekhta hai, aur har baar dekhne ka record rehta hai. JPG, PNG ya PDF, 8MB tak.",
        )}
      </p>
    </Card>
  );
}
