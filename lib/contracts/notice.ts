/** Inbox — see lib/services/notice/noticeService.ts for the masking rule. */

import type { NoticeKind } from "@prisma/client";

export interface NoticeView {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  href: string | null;
  /**
   * The sender is deliberately hidden until the user acts. Drives the lock
   * badge only — `title` and `body` are already written without identifying
   * detail by whoever created the notice.
   */
  actorMasked: boolean;
  relatedId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NoticeListResponse {
  ok: boolean;
  notices: NoticeView[];
  unreadCount: number;
}
