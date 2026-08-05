"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BrainCircuit, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useGrio } from "./GrioProvider";
import { GRIO_ACTIONS, type GrioActionKey, type GrioActionSpec } from "@/lib/contracts/grio";

/**
 * The buttons Grio proposes — doc 11 §3.2/§7.1.
 *
 * The whole point of this component is that it is boring. A marker in the
 * model's reply became a `{key, arg}` pair; this turns that pair into a
 * control and *nothing else happens until a finger lands on it*. There is no
 * auto-run path, not even for `nav`, and no code here reads the model's text.
 *
 * `nav` skips the confirm sheet because it is a link — the destination is a
 * page the user can already reach from the bottom nav, so a modal asking
 * "really navigate?" would be friction that protects nothing. `do` and
 * `remember` write something, so they get the sheet. That split is `kind`'s
 * only job.
 */

export interface GrioActionRequest {
  key: GrioActionKey;
  arg: string | null;
}

export default function GrioActionChips({ actions }: { actions: GrioActionRequest[] }) {
  const router = useRouter();
  const { close } = useGrio();
  const { toast } = useToast();
  const [pending, setPending] = useState<GrioActionRequest | null>(null);
  const [running, setRunning] = useState(false);
  /** Keys already run — a "do" is not something to fire twice by mistake. */
  const [completed, setCompleted] = useState<string[]>([]);

  if (actions.length === 0) return null;

  function chipId(a: GrioActionRequest) {
    return `${a.key}:${a.arg ?? ""}`;
  }

  function handleClick(action: GrioActionRequest) {
    const spec = GRIO_ACTIONS[action.key] as GrioActionSpec;
    if (spec.kind === "nav" && spec.href) {
      close();
      router.push(spec.href);
      return;
    }
    setPending(action);
  }

  async function runPending() {
    if (!pending) return;
    const spec = GRIO_ACTIONS[pending.key] as GrioActionSpec;
    setRunning(true);
    try {
      const res =
        spec.kind === "remember"
          ? await fetch("/api/grio/memory", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fact: pending.arg ?? "" }),
            })
          : await fetch(spec.endpoint!, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });

      const json = await res.json().catch(() => ({}) as { ok?: boolean; message?: string });
      if (!res.ok || json.ok === false) {
        // The endpoint's own gate said no — that answer is the authority, not
        // the fact that Grio offered the button (§3.1).
        toast({ title: "Nahi ho paya", description: json.message ?? "Dobara try karein.", tone: "error" });
        return;
      }

      setCompleted((prev) => [...prev, chipId(pending)]);
      toast({ title: spec.kind === "remember" ? "Grio yaad rakhega ✓" : (spec.done ?? "Ho gaya ✓"), tone: "success" });
    } catch {
      toast({ title: "Network error — dobara try karein", tone: "error" });
    } finally {
      setRunning(false);
      setPending(null);
    }
  }

  const pendingSpec = pending ? (GRIO_ACTIONS[pending.key] as GrioActionSpec) : null;

  return (
    <>
      <div className="flex max-w-[85%] flex-wrap gap-2">
        {actions.map((action) => {
          const spec = GRIO_ACTIONS[action.key] as GrioActionSpec;
          const isDone = completed.includes(chipId(action));
          const isRemember = spec.kind === "remember";
          return (
            <button
              key={chipId(action)}
              type="button"
              disabled={isDone}
              onClick={() => handleClick(action)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 px-3.5 py-2 text-[0.8125rem] font-medium text-gold-700 transition-colors hover:border-gold-500 disabled:opacity-55 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300"
            >
              {isRemember ? <BrainCircuit className="size-3.5" /> : <ArrowRight className="size-3.5" />}
              {/* Label from the catalog, never from the reply — §7.2 / D-61. */}
              {isDone ? "Done ✓" : spec.label}
              {isRemember && action.arg && (
                <span className="max-w-[10rem] truncate font-normal opacity-75">· {action.arg}</span>
              )}
            </button>
          );
        })}
      </div>

      <Sheet
        open={pending !== null}
        onClose={() => (running ? undefined : setPending(null))}
        variant="center"
        title={pendingSpec?.kind === "remember" ? "Yaad rakhein?" : pendingSpec?.label}
        description={
          pendingSpec?.kind === "remember"
            ? "Grio ise aage ki baat-cheet me yaad rakhega. Aap ise kabhi bhi hata sakte hain."
            : pendingSpec?.confirm
        }
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth disabled={running} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              fullWidth
              disabled={running}
              icon={running ? <Loader2 className="size-4 animate-spin" /> : undefined}
              onClick={runPending}
            >
              {pendingSpec?.kind === "remember" ? "Remember" : "Confirm"}
            </Button>
          </div>
        }
      >
        {pendingSpec?.kind === "remember" && pending?.arg && (
          <p className="rounded-md border border-line bg-bg-subtle px-3.5 py-2.5 text-[0.875rem] italic leading-relaxed text-ink">
            &ldquo;{pending.arg}&rdquo;
          </p>
        )}
      </Sheet>
    </>
  );
}
