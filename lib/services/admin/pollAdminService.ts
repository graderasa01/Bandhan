import "server-only";
import { prisma } from "@/lib/db/prisma";
import { THEME_LABEL } from "@/lib/vibe/pollThemes";
import type { Poll, PollTheme, Role } from "@prisma/client";

/**
 * Admin CRUD for the Mindset Arena's poll bank.
 *
 * ## Why this exists at all
 *
 * The bank was code (`prisma/seed.ts`) so every new question needed a
 * deploy. Fine for the first 66, wrong going forward — the rotation's whole
 * value (`lib/vibe/pollThemes.ts`) depends on someone topping up a theme
 * regularly, and "someone" is Devesh, not whoever last touched the seed file.
 *
 * ## Why edit is blocked once a poll has votes, and delete never exists
 *
 * A poll's votes are public on people's Soch Boards (by name) and feed
 * `sochFit` matching (`lib/services/match/sochFit.ts`). Changing the question
 * or options under an existing vote silently rewrites what someone is on
 * record as having said. `retiredAt` is the only way out of the rotation —
 * see the schema comment on `Poll.retiredAt`.
 */

export interface AdminPollRow {
  id: string;
  slug: string;
  theme: PollTheme;
  themeLabel: string;
  question: string;
  options: string[];
  sortOrder: number;
  publishedOn: string | null;
  retiredAt: string | null;
  voteCount: number;
}

export async function listPolls(): Promise<AdminPollRow[]> {
  const polls = await prisma.poll.findMany({
    orderBy: [{ theme: "asc" }, { sortOrder: "asc" }],
    include: { _count: { select: { votes: true } } },
  });
  return polls.map(toRow);
}

function toRow(p: Poll & { _count: { votes: number } }): AdminPollRow {
  return {
    id: p.id,
    slug: p.slug,
    theme: p.theme,
    themeLabel: THEME_LABEL[p.theme],
    question: p.question,
    options: p.options,
    sortOrder: p.sortOrder,
    publishedOn: p.publishedOn,
    retiredAt: p.retiredAt?.toISOString() ?? null,
    voteCount: p._count.votes,
  };
}

function slugify(question: string, salt: string): string {
  const base = question
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "poll"}-${salt}`;
}

export type PollAdminResult = { ok: true; poll: AdminPollRow } | { ok: false; error: string; message: string };

export async function createPoll(params: {
  theme: PollTheme;
  question: string;
  options: string[];
  actorId: string;
  actorRole: Role;
}): Promise<PollAdminResult> {
  const question = params.question.trim();
  const options = params.options.map((o) => o.trim()).filter(Boolean);

  if (question.length < 10) {
    return { ok: false, error: "QUESTION_TOO_SHORT", message: "Sawaal kam se kam 10 characters ka ho." };
  }
  if (options.length < 2 || options.length > 4) {
    return { ok: false, error: "BAD_OPTION_COUNT", message: "2 se 4 options chahiye." };
  }
  if (new Set(options).size !== options.length) {
    return { ok: false, error: "DUPLICATE_OPTIONS", message: "Do options same nahi ho sakte." };
  }

  // Every poll goes to the back of its theme's queue — new content should be
  // seen after everything already promised to today's participants, not
  // jump the line and bump a poll someone was expecting.
  const maxSort = await prisma.poll.aggregate({ where: { theme: params.theme }, _max: { sortOrder: true } });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
  const slug = slugify(question, Date.now().toString(36));

  const poll = await prisma.$transaction(async (tx) => {
    const created = await tx.poll.create({
      data: { slug, theme: params.theme, question, options, sortOrder },
      include: { _count: { select: { votes: true } } },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: "POLL_CREATED",
        targetType: "poll",
        targetId: created.id,
        newValue: question,
      },
    });
    return created;
  });

  return { ok: true, poll: toRow(poll) };
}

/**
 * Edits question/options — only while `voteCount === 0`. Once anyone has
 * voted, this returns `LOCKED`; the caller's only remaining actions are
 * retire/restore. Theme *can* still change post-vote (it just moves the
 * question to a different day's rotation, doesn't rewrite what was asked).
 */
export async function updatePoll(params: {
  id: string;
  theme?: PollTheme;
  question?: string;
  options?: string[];
  actorId: string;
  actorRole: Role;
}): Promise<PollAdminResult> {
  const existing = await prisma.poll.findUnique({
    where: { id: params.id },
    include: { _count: { select: { votes: true } } },
  });
  if (!existing) return { ok: false, error: "NOT_FOUND", message: "Poll nahi mila." };

  const wantsContentChange = params.question !== undefined || params.options !== undefined;
  if (wantsContentChange && existing._count.votes > 0) {
    return {
      ok: false,
      error: "LOCKED",
      message: "Is poll par vote aa chuke hain — sawaal ya options ab badle nahi ja sakte. Retire karke naya banaiye.",
    };
  }

  const question = params.question !== undefined ? params.question.trim() : existing.question;
  const options = params.options !== undefined ? params.options.map((o) => o.trim()).filter(Boolean) : existing.options;

  if (params.question !== undefined && question.length < 10) {
    return { ok: false, error: "QUESTION_TOO_SHORT", message: "Sawaal kam se kam 10 characters ka ho." };
  }
  if (params.options !== undefined) {
    if (options.length < 2 || options.length > 4) {
      return { ok: false, error: "BAD_OPTION_COUNT", message: "2 se 4 options chahiye." };
    }
    if (new Set(options).size !== options.length) {
      return { ok: false, error: "DUPLICATE_OPTIONS", message: "Do options same nahi ho sakte." };
    }
  }

  const poll = await prisma.$transaction(async (tx) => {
    const updated = await tx.poll.update({
      where: { id: params.id },
      data: { theme: params.theme ?? existing.theme, question, options },
      include: { _count: { select: { votes: true } } },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: "POLL_UPDATED",
        targetType: "poll",
        targetId: params.id,
        previousValue: existing.question,
        newValue: question,
      },
    });
    return updated;
  });

  return { ok: true, poll: toRow(poll) };
}

export async function setRetired(params: {
  id: string;
  retired: boolean;
  actorId: string;
  actorRole: Role;
}): Promise<PollAdminResult> {
  const existing = await prisma.poll.findUnique({ where: { id: params.id } });
  if (!existing) return { ok: false, error: "NOT_FOUND", message: "Poll nahi mila." };

  const poll = await prisma.$transaction(async (tx) => {
    const updated = await tx.poll.update({
      where: { id: params.id },
      data: { retiredAt: params.retired ? new Date() : null },
      include: { _count: { select: { votes: true } } },
    });
    await tx.adminAuditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        actionType: params.retired ? "POLL_RETIRED" : "POLL_RESTORED",
        targetType: "poll",
        targetId: params.id,
        previousValue: existing.question,
      },
    });
    return updated;
  });

  return { ok: true, poll: toRow(poll) };
}
