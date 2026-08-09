import { Sparkles } from "lucide-react";
import SochBoardList from "@/components/vibe/SochBoardList";
import type { SochBoardEntry } from "@/lib/services/vibe/sochBoardService";
import { getT } from "@/lib/i18n/server";

/**
 * The public, no-login Soch Board — `mediaUrlPrefix` points at the
 * token-scoped `/api/media/shared/[token]/`, not the authenticated
 * `/api/media/[id]` every other voice clip in the app uses. See that route's
 * header for why this is the one deliberately unauthenticated exception.
 */
export default async function SharedSochBoardView({
  sharerName,
  entries,
  token,
}: {
  sharerName: string;
  entries: SochBoardEntry[];
  token: string;
}) {
  const t = await getT();
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-gold-400 to-gold-600 text-primary-fg">
          <Sparkles className="size-5" />
        </span>
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl font-bold text-wine-700">
            {sharerName}
            {t("share.sochBoardView.titleSuffix", " ki Soch Board")}
          </p>
          <p className="text-[0.8125rem] text-muted">{t("share.sochBoardView.subtitle", "BandhanTak par iski soch, apne hi jawabon me")}</p>
        </div>
      </div>

      <SochBoardList
        entries={entries.map((e) => ({
          pollId: e.pollId,
          question: e.question,
          chosenOption: e.chosenOption,
          voiceNote: e.voiceNote?.approved ? { mediaId: e.voiceNote.mediaId, seconds: e.voiceNote.seconds } : null,
        }))}
        mediaUrlPrefix={`/api/media/shared/${token}/`}
      />

      <p className="mt-8 text-center text-[0.75rem] text-subtle">{t("share.sochBoardView.footer", "BandhanTak — AI-guided, verified matrimony")}</p>
    </div>
  );
}
