"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
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
 * "really navigate?" would be friction that protects nothing. `do` spends a
 * credit or pings a human, so it gets the sheet. (`remember` used to as well;
 * it no longer reaches this component — `GrioChatCore` saves it straight
 * away, see the "confirm gate" note on `GrioActionKind` in lib/contracts/grio.ts.)
 */

export interface GrioActionRequest {
  key: GrioActionKey;
  arg: string | null;
}

export default function GrioActionChips({ actions }: { actions: GrioActionRequest[] }) {
  const t = useT();
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
      const res = await fetch(spec.endpoint!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      const json = await res.json().catch(() => ({}) as { ok?: boolean; message?: string });
      if (!res.ok || json.ok === false) {
        // The endpoint's own gate said no — that answer is the authority, not
        // the fact that Grio offered the button (§3.1).
        toast({
          title: t("grio.actionFailed", "Nahi ho paya"),
          description: json.message ?? t("grio.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return;
      }

      setCompleted((prev) => [...prev, chipId(pending)]);
      toast({ title: spec.done ?? t("grio.actionDone", "Ho gaya ✓"), tone: "success" });
    } catch {
      toast({ title: t("grio.networkError", "Network error — dobara try karein"), tone: "error" });
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
          return (
            <button
              key={chipId(action)}
              type="button"
              disabled={isDone}
              onClick={() => handleClick(action)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-gold-300 bg-gold-50 px-3.5 py-2 text-[0.8125rem] font-medium text-gold-700 transition-colors hover:border-gold-500 disabled:opacity-55 dark:border-gold-700/50 dark:bg-gold-900/20 dark:text-gold-300"
            >
              <ArrowRight className="size-3.5" />
              {/* Label from the catalog, never from the reply — §7.2 / D-61. */}
              {isDone ? t("grio.chipDone", "Done ✓") : spec.label}
            </button>
          );
        })}
      </div>

      <Sheet
        open={pending !== null}
        onClose={() => (running ? undefined : setPending(null))}
        variant="center"
        title={pendingSpec?.label}
        description={pendingSpec?.confirm}
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
              Confirm
            </Button>
          </div>
        }
      >
        {null}
      </Sheet>
    </>
  );
}
