import VoicePlayer from "@/components/voice/VoicePlayer";
import Card from "@/components/ui/Card";
import { getT } from "@/lib/i18n/server";

export interface SochBoardListEntry {
  pollId: string;
  question: string;
  chosenOption: string;
  voiceNote: { mediaId: string; seconds: number } | null;
}

/**
 * Read-only rendering, reused across three surfaces: the owner's own preview
 * (`/user/vibe`), a visitor's view (`/user/profile/[id]`), and the public
 * share page (`/b/[token]`) — only `mediaUrlPrefix` changes between them
 * (authenticated `/api/media/` vs. the token-scoped `/api/media/shared/`).
 */
export default async function SochBoardList({
  entries,
  mediaUrlPrefix,
}: {
  entries: SochBoardListEntry[];
  mediaUrlPrefix: string;
}) {
  const t = await getT();
  if (entries.length === 0) {
    return (
      <p className="text-[0.8125rem] text-muted">
        {t("vibe.sochBoardList.empty", "Abhi koi poll jawab nahi hai.")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <Card key={e.pollId} variant="soft" padding="sm">
          <p className="text-[0.8125rem] text-muted">{e.question}</p>
          <p className="mt-0.5 text-[0.9375rem] font-semibold text-wine-700">{e.chosenOption}</p>
          {e.voiceNote && (
            <VoicePlayer src={`${mediaUrlPrefix}${e.voiceNote.mediaId}`} seconds={e.voiceNote.seconds} className="mt-2" />
          )}
        </Card>
      ))}
    </div>
  );
}
