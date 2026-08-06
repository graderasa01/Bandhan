"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, RotateCcw, Search, ShieldOff } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Sheet from "@/components/ui/Sheet";
import Textarea from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import type { AdminUserRow, UserStatusAction } from "@/lib/services/admin/userAdminService";

const STATUS_FILTERS = ["ALL", "ACTIVE", "INCOMPLETE", "SUSPENDED", "BLOCKED"] as const;

const STATUS_BADGE: Record<string, "verified" | "pending" | "blocked" | "incomplete"> = {
  ACTIVE: "verified",
  INCOMPLETE: "incomplete",
  SUSPENDED: "pending",
  BLOCKED: "blocked",
  DELETED: "blocked",
};

const ACTION_COPY: Record<UserStatusAction, { title: string; verb: string; hint: string }> = {
  SUSPEND: {
    title: "Account suspend karein",
    verb: "Suspend",
    hint: "Login turant band ho jayega aur chaalu session bhi khatam. Baad mein wapas chaalu kiya ja sakta hai.",
  },
  BLOCK: {
    title: "Account block karein",
    verb: "Block",
    hint: "Suspend jaisa hi, par ye permanent maana jata hai — sirf saaf-saaf rule todne par.",
  },
  REACTIVATE: {
    title: "Account wapas chaalu karein",
    verb: "Reactivate",
    hint: "User dobara login kar payega.",
  },
};

/**
 * The user directory — search, filter, and the one place an account's status
 * can be changed.
 *
 * Contact details arrive already masked from the server (see
 * `userAdminService`), so nothing here can un-mask them; the search box still
 * matches full numbers because the *query* runs server-side against the stored
 * value.
 *
 * Every status change goes through the reason sheet. That is not friction for
 * its own sake: the audit row is only worth reading if it says *why*, and an
 * optional field on a destructive action is an empty field.
 */
export default function UserDirectory({
  rows,
  total,
  page,
  pageSize,
}: {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const activeStatus = searchParams.get("status") ?? "ALL";

  const [target, setTarget] = useState<{ row: AdminUserRow; action: UserStatusAction } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function applyParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    // Any change to the filters invalidates the page number — staying on page 4
    // of a result set that now has one page shows an empty table.
    if (!("page" in next)) params.delete("page");
    startTransition(() => router.push(`/admin/users?${params.toString()}`));
  }

  async function submit() {
    if (!target || reason.trim().length < 4) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${target.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: target.action, reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: "Nahi ho paya", description: json.message, tone: "error" });
        return;
      }
      toast({
        title: `${target.row.fullName} ab ${json.status} hai`,
        description: "Audit log mein record ho gaya.",
        tone: "success",
      });
      setTarget(null);
      setReason("");
      router.refresh();
    } catch {
      toast({ title: "Network error", description: "Dobara try karein.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <Card padding="sm" className="mb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyParams({ q: query });
          }}
          className="flex items-center gap-2 rounded-full border border-line bg-bg-subtle px-3"
        >
          <Search className="size-4 shrink-0 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Naam, mobile ya email"
            aria-label="Search users"
            className="min-h-12 w-full min-w-0 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
          />
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => {
            const active = activeStatus === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => applyParams({ status: s === "ALL" ? null : s })}
                aria-pressed={active}
                className={
                  active
                    ? "min-h-9 rounded-full bg-gradient-to-r from-gold-400 to-gold-600 px-3 text-xs font-semibold text-primary-fg shadow-gold"
                    : "min-h-9 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
                }
              >
                {s === "ALL" ? "Sab" : s}
              </button>
            );
          })}
        </div>
      </Card>

      <p className="mb-3 text-sm text-muted">
        {total.toLocaleString("en-IN")} accounts mile{isPending && " — load ho raha hai…"}
      </p>

      {rows.length === 0 ? (
        <Card padding="lg">
          <p className="text-center text-sm text-muted">Is filter par koi account nahi mila.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.id} padding="sm">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">{row.fullName}</p>
                    <Badge variant={STATUS_BADGE[row.status] ?? "pending"} size="sm">
                      {row.status}
                    </Badge>
                    {row.role !== "USER" && (
                      <Badge variant="ai-suggested" size="sm">
                        {row.role}
                      </Badge>
                    )}
                    {row.planCode && row.planCode !== "FREE" && (
                      <Badge variant="paid" size="sm">
                        {row.planCode}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">
                    {[row.maskedMobile, row.maskedEmail].filter(Boolean).join("  ·  ") || "Koi contact nahi"}
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">
                    Joined {row.joinedAt}
                    {row.lastLoginAt ? `  ·  last login ${row.lastLoginAt}` : "  ·  kabhi login nahi"}
                    {row.profileStatus ? `  ·  profile ${row.profileStatus}` : "  ·  profile nahi bani"}
                  </p>
                </div>

                {/* Admin rows carry no buttons — the service refuses those calls
                    anyway, and a button that always errors is worse than none. */}
                {row.role !== "ADMIN" && (
                  <div className="flex shrink-0 gap-1.5">
                    {row.status === "ACTIVE" || row.status === "INCOMPLETE" ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setTarget({ row, action: "SUSPEND" });
                            setReason("");
                          }}
                        >
                          <ShieldOff className="size-4" />
                          Suspend
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setTarget({ row, action: "BLOCK" });
                            setReason("");
                          }}
                        >
                          <Ban className="size-4" />
                          Block
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setTarget({ row, action: "REACTIVATE" });
                          setReason("");
                        }}
                      >
                        <RotateCcw className="size-4" />
                        Reactivate
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => applyParams({ page: String(page - 1) })}
          >
            Previous
          </Button>
          <span className="text-sm text-muted">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => applyParams({ page: String(page + 1) })}
          >
            Next
          </Button>
        </div>
      )}

      <Sheet
        open={target !== null}
        onClose={() => setTarget(null)}
        variant="center"
        title={target ? ACTION_COPY[target.action].title : ""}
        description={target ? `${target.row.fullName} — ${ACTION_COPY[target.action].hint}` : ""}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant={target?.action === "REACTIVATE" ? "primary" : "accent"}
              onClick={submit}
              loading={saving}
              disabled={reason.trim().length < 4}
            >
              {target ? ACTION_COPY[target.action].verb : ""}
            </Button>
          </div>
        }
      >
        <Textarea
          label="Reason (audit log mein jayega)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Kyun? — ye record permanently save hota hai."
          maxLength={500}
        />
      </Sheet>
    </>
  );
}
