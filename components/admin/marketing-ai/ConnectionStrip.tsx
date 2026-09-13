"use client";

import { Cable } from "lucide-react";
import { CONNECTION_HEALTH_LABEL, type ConnectionHealth, type ConnectionStatusRow, type MarketingProviderKey } from "@/lib/contracts/marketingAi";
import { cn } from "@/lib/utils";

const DOT: Record<ConnectionHealth, string> = {
  CONNECTED: "bg-trust",
  NEEDS_ATTENTION: "bg-warn",
  NOT_CONNECTED: "bg-line-strong",
};

const CHIP: Record<ConnectionHealth, string> = {
  CONNECTED: "border-trust/25 bg-trust-bg/60 text-ink",
  NEEDS_ATTENTION: "border-warn/40 bg-warn-bg text-ink",
  NOT_CONNECTED: "border-line bg-surface text-muted",
};

/**
 * Zone C (§2) — one chip per account, three states, never a key. Tapping a
 * chip opens the connection sheet; BandhanTak's own data has no sheet
 * because there is nothing to configure.
 */
export default function ConnectionStrip({ rows, onOpen }: { rows: ConnectionStatusRow[]; onOpen: (provider: MarketingProviderKey) => void }) {
  const connected = rows.filter((r) => r.health === "CONNECTED").length;
  return (
    <section aria-label="Account connections" className="rounded-lg border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          <Cable className="size-3.5" aria-hidden />
          Accounts
        </p>
        <p className="text-xs text-muted">
          {connected} / {rows.length} connected · keys kabhi screen par nahi
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => {
          const isInternal = row.provider === "BANDHANTAK";
          const body = (
            <>
              <span className={cn("size-2 shrink-0 rounded-full", DOT[row.health])} aria-hidden />
              <span className="font-medium">{row.label}</span>
              <span className="text-[0.6875rem] text-muted">{CONNECTION_HEALTH_LABEL[row.health]}</span>
            </>
          );
          if (isInternal) {
            return (
              <span key={row.provider} className={cn("inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs", CHIP[row.health])}>
                {body}
              </span>
            );
          }
          return (
            <button
              key={row.provider}
              type="button"
              onClick={() => onOpen(row.provider as MarketingProviderKey)}
              title={row.todo ?? row.accountRef ?? undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs transition-colors hover:border-gold-500",
                CHIP[row.health],
              )}
            >
              {body}
            </button>
          );
        })}
      </div>
    </section>
  );
}
