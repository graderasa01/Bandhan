"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LanguageProvider";
import { useGrio } from "./GrioProvider";
import GrioPersonPicker from "./GrioPersonPicker";
import {
  GRIO_ACTIONS,
  type GrioActionKey,
  type GrioActionSheet,
  type GrioActionSpec,
} from "@/lib/contracts/grio";
import { runGrioAction } from "./runGrioAction";

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
 * credit, reaches a person, or pings a human, so it gets the sheet.
 * (`remember` used to as well; it no longer reaches this component —
 * `GrioChatCore` saves it straight away, see the "confirm gate" note on
 * `GrioActionKind` in lib/contracts/grio.ts.)
 *
 * ## Phase H: resolving "on whom?"
 *
 * A spec with `needs: "profile"` cannot run until somebody is chosen, and this
 * component is the only place that choosing happens. Two routes in, both of
 * them the user's own doing:
 *
 *  - the profile they already opened (`scope.kind === "candidate"`), or
 *  - a row they tap in `GrioPersonPicker`.
 *
 * There is deliberately no third route — in particular, nothing reads
 * `action.arg` for an id. The marker can carry free text (only `remember` uses
 * it), so treating that text as a target would hand the model the one decision
 * this design refuses to give it.
 */

export interface GrioActionRequest {
  key: GrioActionKey;
  arg: string | null;
}

/** Who a targeted action will land on, once the user has said. */
export interface GrioActionTargetRef {
  profileId: string;
  name: string;
}

export default function GrioActionChips({
  actions,
  onOpenSheet,
  onOutcome,
}: {
  actions: GrioActionRequest[];
  /** `sheet` actions don't post — they hand off to a recorder the chat hosts. */
  onOpenSheet: (sheet: GrioActionSheet, target: GrioActionTargetRef | null) => void;
  /**
   * A code-owned sentence describing what just happened, for the transcript.
   * Without it the next turn's model still believes the button is unpressed.
   */
  onOutcome: (line: string) => void;
}) {
  const t = useT();
  const router = useRouter();
  const { close, scope } = useGrio();
  const { toast } = useToast();
  const [awaitingTarget, setAwaitingTarget] = useState<GrioActionRequest | null>(null);
  const [pending, setPending] = useState<{ action: GrioActionRequest; target: GrioActionTargetRef | null } | null>(
    null,
  );
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

    if (spec.needs === "profile") {
      // A `match` scope is not a usable target here: these endpoints take a
      // profile id, and a matched person is past the point where any of them
      // would make sense. So anything but an open candidate goes to the picker.
      if (scope?.kind === "candidate") {
        proceed(action, { profileId: scope.profileId, name: scope.name });
      } else {
        setAwaitingTarget(action);
      }
      return;
    }

    proceed(action, null);
  }

  function proceed(action: GrioActionRequest, target: GrioActionTargetRef | null) {
    const spec = GRIO_ACTIONS[action.key] as GrioActionSpec;
    if (spec.kind === "sheet" && spec.sheet) {
      // The recorder is its own confirmation — it shows what will be sent, to
      // whom, and what it costs, before anything leaves.
      onOpenSheet(spec.sheet, target);
      return;
    }
    setPending({ action, target });
  }

  async function runPending() {
    if (!pending) return;
    setRunning(true);
    try {
      const result = await runGrioAction(pending.action.key, pending.target?.profileId ?? null);
      if (!result.ok) {
        toast({
          title: t("grio.actionFailed", "Nahi ho paya"),
          description: result.message ?? t("grio.tryAgain", "Dobara try karein."),
          tone: "error",
        });
        return;
      }

      setCompleted((prev) => [...prev, chipId(pending.action)]);
      toast({ title: result.done ?? t("grio.actionDone", "Ho gaya ✓"), tone: "success" });

      // Catalog copy only, and no name: the transcript is read by the model on
      // the next turn, and who the user picked in the picker is not something
      // it was given. What happened is; to whom is not.
      if (result.outcome) onOutcome(result.outcome);
    } finally {
      setRunning(false);
      setPending(null);
    }
  }

  const pendingSpec = pending ? (GRIO_ACTIONS[pending.action.key] as GrioActionSpec) : null;

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

      {/* Mounted only while a target is actually being chosen, so a conversation
          with a dozen replies isn't a dozen idle pickers. */}
      {awaitingTarget && (
        <GrioPersonPicker
          open
          onClose={() => setAwaitingTarget(null)}
          onPick={(person) => {
            const action = awaitingTarget;
            setAwaitingTarget(null);
            proceed(action, { profileId: person.profileId, name: person.name });
          }}
        />
      )}

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
        {/* Named here rather than in `confirm`, which is catalog copy shared by
            every target. Seeing the name at the last step is the difference
            between confirming an action and confirming an action on a person. */}
        {pending?.target ? (
          <p className="text-[0.875rem] text-ink">
            {t("grio.confirmOnPerson", "Ye {name} par hoga.").replace("{name}", pending.target.name)}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}
