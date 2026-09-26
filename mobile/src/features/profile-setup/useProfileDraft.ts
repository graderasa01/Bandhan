import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMyProfile, useSaveProfile } from "~/hooks/queries";
import type { FillingFor, SaveDraftResponse } from "~/types/api";

type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_MS = 1200;

/**
 * The member's answers while they edit: the server's values with local edits
 * on top, autosaved a moment after each change (and flushed on leaving a
 * step), so closing the app mid-way never loses an answer. Only the keys that
 * actually changed are sent — each one as a value the member typed and
 * confirmed, which is what the live-readiness rule counts.
 */
export function useProfileDraft() {
  const me = useMyProfile();
  const save = useSaveProfile();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [fillingFor, setFillingForState] = useState<FillingFor | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const dirty = useRef<Set<string>>(new Set());
  const forDirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest answers for `flush` (a timer or an unmount may run it) — kept by the setters below, the only writers.
  const editsRef = useRef(edits);
  const fillingRef = useRef(fillingFor);

  const values = useMemo(() => ({ ...(me.data?.values ?? {}), ...edits }), [me.data?.values, edits]);
  const effectiveFillingFor: FillingFor = fillingFor ?? me.data?.fillingFor ?? "self";

  /** Sends whatever changed. `res` is null when there was nothing to send. */
  const flush = useCallback(async (): Promise<{ ok: boolean; res: SaveDraftResponse | null }> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (dirty.current.size === 0 && !forDirty.current) return { ok: true, res: null };
    const keys = [...dirty.current];
    const payload = Object.fromEntries(keys.map((k) => [k, editsRef.current[k] ?? ""]));
    dirty.current = new Set();
    const hadFor = forDirty.current;
    const sendFor = hadFor ? (fillingRef.current ?? undefined) : undefined;
    forDirty.current = false;
    setState("saving");
    try {
      const res = await save.mutateAsync({ values: payload, fillingFor: sendFor });
      setState("saved");
      return { ok: true, res };
    } catch {
      keys.forEach((k) => dirty.current.add(k));
      forDirty.current = hadFor;
      setState("error");
      return { ok: false, res: null };
    }
  }, [save]);

  /**
   * Asks the server to re-check readiness without changing anything — an empty
   * autosave runs `activateIfReady`, the one authority on "live".
   */
  const recheck = useCallback(async (): Promise<SaveDraftResponse | null> => {
    try {
      return await save.mutateAsync({ values: {} });
    } catch {
      return null;
    }
  }, [save]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }, [flush]);

  const set = useCallback(
    (key: string, value: string) => {
      editsRef.current = { ...editsRef.current, [key]: value };
      setEdits(editsRef.current);
      dirty.current.add(key);
      setState("idle");
      schedule();
    },
    [schedule],
  );

  const setFillingFor = useCallback(
    (f: FillingFor) => {
      fillingRef.current = f;
      setFillingForState(f);
      forDirty.current = true;
      schedule();
    },
    [schedule],
  );

  // Leaving the screen never drops an answer.
  useEffect(
    () => () => {
      if (dirty.current.size > 0 || forDirty.current) void flush();
    },
    [flush],
  );

  return {
    me,
    values,
    fillingFor: effectiveFillingFor,
    set,
    setFillingFor,
    flush,
    recheck,
    saveState: state,
  };
}
