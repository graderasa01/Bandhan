"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RotateCcw, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Controls";
import { useToast } from "@/components/ui/Toast";
import { THEME_LABEL } from "@/lib/vibe/pollThemes";
import type { AdminPollRow } from "@/lib/services/admin/pollAdminService";
import type { PollTheme } from "@prisma/client";

const THEME_OPTIONS = (Object.keys(THEME_LABEL) as PollTheme[]).map((value) => ({
  value,
  label: THEME_LABEL[value],
}));

async function callApi(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ ok: false, message: "Server ne kuch nahi bola." }));
  return { res, json };
}

export default function PollManager({ initialPolls }: { initialPolls: AdminPollRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [showRetired, setShowRetired] = useState(false);

  const grouped = new Map<PollTheme, AdminPollRow[]>();
  for (const p of initialPolls) {
    if (p.retiredAt && !showRetired) continue;
    const list = grouped.get(p.theme) ?? [];
    list.push(p);
    grouped.set(p.theme, list);
  }

  return (
    <div className="space-y-8">
      <NewPollForm onCreated={() => router.refresh()} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-wine-700">Sawaal bank</h2>
        <label className="flex items-center gap-2 text-[0.8125rem] text-muted">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
            className="size-4 rounded border-line-strong"
          />
          Retired bhi dikhayein
        </label>
      </div>

      {(Object.keys(THEME_LABEL) as PollTheme[]).map((theme) => {
        const rows = grouped.get(theme);
        if (!rows || rows.length === 0) return null;
        return (
          <section key={theme}>
            <h3 className="mb-3 flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
              {THEME_LABEL[theme]}
              <span className="text-[0.75rem] font-normal text-subtle">
                {rows.length} sawaal — theme har ~{rows.length} hafte me repeat hota hai
              </span>
            </h3>
            <div className="space-y-3">
              {rows.map((poll) => (
                <PollRow key={poll.id} poll={poll} onChanged={() => router.refresh()} toast={toast} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NewPollForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [theme, setTheme] = useState<PollTheme>("HALKA");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [busy, setBusy] = useState(false);

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  function addOption() {
    if (options.length >= 4) return;
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (question.trim().length < 10) {
      toast({ title: "Sawaal chhota hai", description: "Kam se kam 10 characters likhiye.", tone: "error" });
      return;
    }
    if (cleanOptions.length < 2) {
      toast({ title: "Options kam hain", description: "Kam se kam 2 options chahiye.", tone: "error" });
      return;
    }
    if (new Set(cleanOptions).size !== cleanOptions.length) {
      toast({ title: "Options me repeat hai", description: "Har option alag hona chahiye.", tone: "error" });
      return;
    }

    setBusy(true);
    try {
      const { res, json } = await callApi("/api/admin/polls", "POST", { theme, question: question.trim(), options: cleanOptions });
      if (!res.ok || !json.ok) {
        toast({ title: "Save nahi hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Sawaal jud gaya", description: `${THEME_LABEL[theme]} ki line ke aakhir me.`, tone: "success" });
      setQuestion("");
      setOptions(["", ""]);
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="md">
      <h2 className="mb-3 text-lg font-semibold text-wine-700">Naya sawaal jodein</h2>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[0.8125rem] font-medium text-ink">Theme (hafte ka din)</label>
          <Select
            value={theme}
            onChange={(e) => setTheme(e.target.value as PollTheme)}
            options={THEME_OPTIONS}
          />
        </div>

        <Textarea
          label="Sawaal"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Jaise: Ghar ka monthly budget kaun sambhale?"
          rows={2}
          maxLength={300}
        />

        <div>
          <label className="mb-1 block text-[0.8125rem] font-medium text-ink">Options (2 se 4)</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={120}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="shrink-0 rounded-full p-1.5 text-subtle hover:bg-bg-subtle hover:text-danger"
                    aria-label="Option hataiye"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 4 && (
            <button
              type="button"
              onClick={addOption}
              className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-primary-text"
            >
              <Plus className="size-3.5" />
              Option jodein
            </button>
          )}
        </div>

        {/* Same two content rules as the seed bank — stated here so an admin
            adding a poll sees the constraint at the point of writing it, not
            three files away in a comment nobody opens. */}
        <p className="rounded-md border border-line bg-bg-subtle p-3 text-[0.75rem] leading-relaxed text-muted">
          Koi option &ldquo;sahi jawab&rdquo; jaisa na lage — har option ek soch honi chahiye, sabse behtar jawab nahi. Jaat,
          dahej, rang-roop, ya kamai ka figure kabhi na poochhein — jawab public hote hain naam ke saath.
        </p>

        <Button variant="primary" size="md" disabled={busy} onClick={submit}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Sawaal jodein
        </Button>
      </div>
    </Card>
  );
}

function PollRow({
  poll,
  onChanged,
  toast,
}: {
  poll: AdminPollRow;
  onChanged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(poll.question);
  const [options, setOptions] = useState(poll.options);
  const [busy, setBusy] = useState(false);

  const locked = poll.voteCount > 0;
  const retired = poll.retiredAt !== null;

  async function saveEdit() {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    setBusy(true);
    try {
      const { res, json } = await callApi(`/api/admin/polls/${poll.id}`, "PATCH", {
        question: question.trim(),
        options: cleanOptions,
      });
      if (!res.ok || !json.ok) {
        toast({ title: "Save nahi hua", description: json.message, tone: "error" });
        return;
      }
      toast({ title: "Poll update ho gaya", tone: "success" });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleRetired() {
    setBusy(true);
    try {
      const { res, json } = await callApi(`/api/admin/polls/${poll.id}`, "PATCH", { retired: !retired });
      if (!res.ok || !json.ok) {
        toast({ title: "Nahi ho paya", description: json.message, tone: "error" });
        return;
      }
      toast({ title: retired ? "Rotation me wapas aa gaya" : "Rotation se hata diya", tone: "success" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant={retired ? "soft" : "default"} padding="md">
      {editing ? (
        <div className="space-y-2.5">
          <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={300} />
          {options.map((opt, i) => (
            <Input
              key={i}
              value={opt}
              onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
              maxLength={120}
            />
          ))}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={saveEdit}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setQuestion(poll.question);
                setOptions(poll.options);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className={retired ? "font-medium text-muted line-through" : "font-medium text-ink"}>
              {poll.question}
            </p>
            {retired && (
              <span className="shrink-0 rounded-full border border-line bg-bg-subtle px-2 py-0.5 text-[0.6875rem] text-subtle">
                Retired
              </span>
            )}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem] text-muted">
            {poll.options.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.75rem] text-subtle">
            <span>{poll.voteCount} vote{poll.voteCount === 1 ? "" : "s"}</span>
            {locked && <span>— sawaal/options ab lock hain</span>}
            <div className="ml-auto flex gap-2">
              {!locked && !retired && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="font-medium text-primary-text underline underline-offset-2"
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={toggleRetired}
                className="inline-flex items-center gap-1 font-medium text-primary-text underline underline-offset-2 disabled:opacity-45"
              >
                {retired ? (
                  <>
                    <RotateCcw className="size-3" />
                    Wapas rotation me
                  </>
                ) : (
                  "Retire"
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
