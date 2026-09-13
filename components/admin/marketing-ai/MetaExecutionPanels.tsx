"use client";

import { useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ImagePlus } from "lucide-react";
import Button from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import type { CreativeRow } from "@/lib/contracts/marketingAi";
import {
  MEDIA_ACCEPTED_MIME,
  MEDIA_MAX_BYTES,
  MEDIA_MIN_EDGE_PX,
  MEDIA_STATUS_META,
  deliveryLabel,
  type CreativeMediaRow,
  type DeliverySnapshot,
  type DeploymentPlatform,
  type MetaDeploymentFacts,
} from "@/lib/contracts/marketingExecution";
import { cn } from "@/lib/utils";

/**
 * MKT-2B pieces of the task detail (doc 14 §8, §18): the actual images behind
 * Meta static briefs with their own separate approval, the Meta facts on a
 * deployment card, and configured-versus-delivery for both platforms. They
 * render inside `TaskDetailSheet` — no new page, no media library.
 *
 * Everything shown arrives in `TaskDetail` from the admin API: never a token,
 * never a raw provider payload.
 */

const MB = 1024 * 1024;

function sizeText(bytes: number): string {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function Fact({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] uppercase tracking-wide text-subtle">{k}</dt>
      <dd className="break-words text-ink">{v}</dd>
    </div>
  );
}

// ============================================================
// Meta ad images — attach, preview, separate approval (doc 14 §8)
// ============================================================

export function CreativeMediaSection({ taskId, creatives, onChanged }: { taskId: string; creatives: CreativeRow[]; onChanged: () => void }) {
  const images = creatives.filter((c) => c.kind === "IMAGE");
  if (!images.length) return null;
  return (
    <details open className="rounded-lg border border-line bg-surface p-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink">Meta ad images — brief approval se alag</summary>
      <div className="mt-2 space-y-3">
        <p className="text-xs text-muted">
          Meta static ad ke liye har IMAGE brief par ek asli image attach karke alag se approve karni hoti hai. Package (brief) approve hona kaafi nahi — bina approved image ke Meta deployment “Creative required” par rukta hai. Image EXIF hata kar re-encode hoti hai; har edge kam se kam {MEDIA_MIN_EDGE_PX}px, aspect 4:5 se 1.91:1 (1080×1080 sabse safe), JPG/PNG/WebP, max {Math.round(MEDIA_MAX_BYTES / MB)} MB.
        </p>
        {images.map((c) => (
          <CreativeImageCard key={c.id} taskId={taskId} creative={c} onChanged={onChanged} />
        ))}
      </div>
    </details>
  );
}

function CreativeImageCard({ taskId, creative, onChanged }: { taskId: string; creative: CreativeRow; onChanged: () => void }) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const conceptId = typeof creative.brief.id === "string" ? creative.brief.id : null;
  const hasApproved = creative.media.some((m) => m.status === "APPROVED");

  async function upload(file: File) {
    if (!(MEDIA_ACCEPTED_MIME as readonly string[]).includes(file.type)) {
      toast({ title: "Sirf JPG, PNG ya WebP image chalegi", tone: "error" });
      return;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      toast({ title: `File ${Math.round(MEDIA_MAX_BYTES / MB)} MB se badi hai`, tone: "error" });
      return;
    }
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/marketing-ai/tasks/${taskId}/creatives/${creative.id}/media`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: "Image attach nahi hui", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: json.duplicate ? "Ye image pehle se attached hai" : "Image attach ho gayi",
        description: json.duplicate ? undefined : "Ab 'Approve image for Meta Ads' se iska alag approval dein.",
        tone: "success",
      });
      onChanged();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function review(media: CreativeMediaRow, decision: "approve" | "reject") {
    setBusy(`${decision}:${media.id}`);
    try {
      const res = await fetch(`/api/admin/marketing-ai/tasks/${taskId}/media/${media.id}/${decision}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({ title: decision === "approve" ? "Approve nahi hua" : "Reject nahi hua", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: decision === "approve" ? "Image approved for Meta Ads" : "Image rejected",
        description: decision === "approve" ? "Meta deployment card par 'Re-check Meta readiness' chalayein." : undefined,
        tone: "success",
      });
      onChanged();
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {creative.title} {conceptId && <span className="font-mono text-[0.6875rem] font-normal text-muted">{conceptId}</span>}
        </p>
        <Pill tone={creative.reviewStatus === "APPROVED" ? "trust" : "neutral"} size="sm">
          Brief {creative.reviewStatus === "APPROVED" ? "approved" : creative.reviewStatus === "REJECTED" ? "rejected" : "draft"}
        </Pill>
      </div>

      {creative.media.length === 0 ? (
        <p className="mt-2 text-xs text-warn">Abhi koi image nahi — is brief wala Meta ad image ke bina nahi banega.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {creative.media.map((m) => (
            <li key={m.id} className="flex flex-wrap items-start gap-3 rounded-sm bg-bg-subtle/60 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of the stored, re-encoded file; its host is a local path or the configured bucket */}
              <img src={m.publicUrl} alt={`${creative.title} — uploaded image`} className="size-20 shrink-0 rounded-sm border border-line object-cover" loading="lazy" />
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={MEDIA_STATUS_META[m.status].tone} size="sm">
                    {MEDIA_STATUS_META[m.status].label}
                  </Pill>
                  <span className="text-muted">
                    {m.width}×{m.height}px · {sizeText(m.sizeBytes)} · {m.mimeType.replace("image/", "")} · sha {m.sha256Prefix}
                  </span>
                </div>
                {!m.productionReady && <p className="mt-1 text-warn">Local disk par stored — sirf preview. Real Meta create ke liye durable public storage (S3_* + S3_PUBLIC_URL) par dobara attach karni hogi.</p>}
                {hasApproved && m.status !== "APPROVED" && <p className="mt-1 text-muted">Approve karne par pehle wali approved image hat jaayegi aur pending Meta create card void hoga — naya card “Re-check Meta readiness” se banega.</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.status !== "APPROVED" && (
                    <Button size="sm" variant="accent" loading={busy === `approve:${m.id}`} disabled={busy !== null} onClick={() => review(m, "approve")} icon={<CheckCircle2 className="size-4" />}>
                      Approve image for Meta Ads
                    </Button>
                  )}
                  {m.status !== "REJECTED" && (
                    <Button size="sm" variant="ghost" loading={busy === `reject:${m.id}`} disabled={busy !== null} onClick={() => review(m, "reject")}>
                      Reject
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex justify-end">
        <input
          ref={input}
          type="file"
          accept={MEDIA_ACCEPTED_MIME.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button size="sm" variant="secondary" loading={busy === "upload"} disabled={busy !== null} onClick={() => input.current?.click()} icon={<ImagePlus className="size-4" />}>
          Attach image
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Meta deployment facts (doc 14 §18)
// ============================================================

const READINESS_TONE = { READY: "trust", MISSING: "danger", UNVERIFIED: "gold" } as const;

export function MetaFactsPanel({ facts }: { facts: MetaDeploymentFacts }) {
  const ids = facts.externalIds;
  const hasIds = !!ids.campaignId || ids.adSetIds.length > 0 || ids.creativeIds.length > 0 || ids.adIds.length > 0;
  const instagram = facts.instagramActorId ? `Instagram ${facts.instagramUsername ? `@${facts.instagramUsername} ` : ""}${facts.instagramActorId}` : "Instagram nahi (sirf Facebook Feed)";
  return (
    <div className="mt-2 space-y-2 rounded-md border border-line bg-surface p-2 text-xs">
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <Fact k="Page / Instagram" v={`Page ${facts.pageName ? `“${facts.pageName}” ` : ""}${facts.pageId ?? "—"} · ${instagram}`} />
        <Fact k="Objective" v={`${facts.objective ?? "—"} · ${facts.objectiveSupport.supported ? "supported" : `blocked — ${facts.objectiveSupport.reason ?? ""}`}`} />
        <Fact k="Audience (resolved)" v={facts.resolvedAudienceSummary ?? "write se theek pehle Meta par exact naam se resolve hoga"} />
        <Fact k="Placements" v={facts.resolvedPlacementSummary ?? "—"} />
      </dl>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-subtle">Last readiness check:</span>
        <Pill tone={READINESS_TONE[facts.readPermission]} size="sm">
          read · ads_read {facts.readPermission}
        </Pill>
        <Pill tone={READINESS_TONE[facts.writePermission]} size="sm">
          write · ads_management {facts.writePermission}
        </Pill>
        <Pill tone={READINESS_TONE[facts.accountAccess]} size="sm">
          ad account access {facts.accountAccess}
        </Pill>
        <Pill tone={facts.accessTier === "UNVERIFIED" ? "gold" : "trust"} size="sm">
          access tier {facts.accessTier}
        </Pill>
      </div>
      <p className="text-subtle">Token ka scope (ads_management) aur ad account par system user ka access alag cheezein hain — Meta create ke liye dono READY chahiye.</p>

      {facts.creativePreviews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {facts.creativePreviews.map((p) => (
            <figure key={p.mediaId} className="w-20">
              {/* eslint-disable-next-line @next/next/no-img-element -- the same stored creative the approval card names */}
              <img src={p.url} alt="Meta creative on the card" className="size-20 rounded-sm border border-line object-cover" loading="lazy" />
              <figcaption className="mt-0.5 truncate text-[0.625rem] text-muted">
                {p.width}×{p.height} · {p.status}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {facts.checkpoint && (
        <p className="text-muted">
          Checkpoint: <span className="font-mono">{facts.checkpoint}</span>
        </p>
      )}
      {hasIds && (
        <p className="break-all font-mono text-[0.625rem] text-muted">
          campaign {ids.campaignId ?? "—"} · ad sets {ids.adSetIds.join(", ") || "—"} · creatives {ids.creativeIds.join(", ") || "—"} · ads {ids.adIds.join(", ") || "—"}
        </p>
      )}
      {facts.deferredRules.length > 0 && (
        <ul className="ml-4 list-disc text-muted">
          {facts.deferredRules.map((rule, i) => (
            <li key={i}>Deferred: {rule}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// Configured vs delivery — both platforms (doc 14 Gap C, §7.4)
// ============================================================

export function DeliveryFacts({ platform, delivery }: { platform: DeploymentPlatform; delivery: DeliverySnapshot | null }) {
  const label = deliveryLabel(platform, delivery);
  const configured = (delivery?.configuredStatus ?? "").toUpperCase();
  const headline = label.delivering ? "Delivering" : configured === "PAUSED" ? "Paused — koi delivery nahi" : "Activated — delivery abhi confirm nahi";
  return (
    <div className="mt-2 rounded-md border border-line p-2 text-xs">
      <p className={cn(label.delivering ? "font-semibold text-trust" : "text-ink")}>
        <span className="font-semibold">{headline}:</span> {label.text}
      </p>
      {delivery && (
        <dl className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <Fact k="Configured (BandhanTak ne set kiya)" v={delivery.configuredStatus ?? "—"} />
          <Fact k={`Effective (${platform === "META" ? "Meta" : "Google"} ke hisaab se)`} v={delivery.effectiveStatus ?? "—"} />
          <Fact k="Delivery / serving" v={delivery.deliveryStatus ?? "—"} />
          <Fact k="Policy / review" v={delivery.policyStatus ?? "—"} />
        </dl>
      )}
      {delivery && delivery.issues.length > 0 && (
        <ul className="ml-4 mt-1 list-disc text-warn">
          {delivery.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
      {delivery && <p className="mt-1 text-subtle">provider snapshot {new Date(delivery.snapshotAt).toLocaleString("en-IN")}</p>}
    </div>
  );
}
