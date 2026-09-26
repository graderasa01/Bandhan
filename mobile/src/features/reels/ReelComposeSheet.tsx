import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Lock, MessageCircle, Send, Sparkles, Wand2 } from "lucide-react-native";
import { memo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Avatar, BottomSheet, GhostButton, Icon, Input, PrimaryButton, SecondaryButton, Text, toast } from "~/components";
import { qk } from "~/hooks/queries";
import { ApiError, errorMessage } from "~/services/api/client";
import { chatService } from "~/services/chat";
import { reelService } from "~/services/reel";
import { radius, useTheme } from "~/theme";
import type { ReelCard } from "~/types/api";
import { firstNameOf } from "~/utils/names";

/**
 *   message  a matched person: a reply without leaving the reel, through the
 *            one message endpoint (`/api/messages/:matchId`) where the chat
 *            gate lives — a locked chat answers 402 and this says so and
 *            offers the thread, it never becomes a second place to unlock.
 *   note     an interest already sent, no match yet: the honest pre-match
 *            message is a note on that interest (`PATCH /api/reel/icebreaker`).
 */
export type ComposeMode = "message" | "note";

export interface ComposeTarget {
  card: ReelCard;
  mode: ComposeMode;
}

const MAX: Record<ComposeMode, number> = { message: 2000, note: 300 };

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "locked"; message: string } | { kind: "error"; message: string };

/**
 * Quick message from the reel. The words are always the member's to edit and
 * nothing leaves without Send: a suggested line (`/api/reel/icebreaker`, the
 * web's icebreaker) only fills the box, and "Grio se likhwayein" hands the
 * same person to Grio, whose draft sheet has its own Send. A failed send says
 * why and keeps the draft; a same-person reopen keeps an unsent draft too.
 */
export const ReelComposeSheet = memo(function ReelComposeSheet({
  target: live,
  onClose,
  onOpenChat,
  onAskGrio,
}: {
  target: ComposeTarget | null;
  onClose: () => void;
  onOpenChat: (matchId: string) => void;
  onAskGrio: (card: ReelCard, ask: string) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const [target, setTarget] = useState(live);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  // Compared by value: the parent builds a fresh `{ card, mode }` every render.
  if (live && (live.card !== target?.card || live.mode !== target?.mode)) {
    // A different person (or purpose) starts clean; the same one keeps its draft.
    if (!target || target.card.id !== live.card.id || target.mode !== live.mode) {
      setStatus({ kind: "idle" });
      setSuggestNote(null);
    }
    setTarget(live);
  }
  if (!target) return null;

  const { card, mode } = target;
  const key = `${mode}:${card.id}`;
  const body = drafts[key] ?? "";
  const first = firstNameOf(card.displayName);
  const matchId = card.matchId;
  const setBody = (v: string) => setDrafts((d) => ({ ...d, [key]: v.slice(0, MAX[mode]) }));

  async function suggest() {
    if (suggesting) return;
    setSuggesting(true);
    setSuggestNote(null);
    try {
      const res = await reelService.icebreaker(card.id);
      if (res.ok && res.suggestion) setBody(res.suggestion);
      else setSuggestNote(res.message ?? "Abhi suggestion nahi ban paaya — khud likh dijiye.");
    } catch (err) {
      setSuggestNote(errorMessage(err, "Abhi suggestion nahi ban paaya — khud likh dijiye."));
    } finally {
      setSuggesting(false);
    }
  }

  async function send() {
    const text = body.trim();
    if (!text || status.kind === "sending") return;
    setStatus({ kind: "sending" });
    try {
      if (mode === "message") {
        if (!matchId) throw new ApiError(409, "NO_MATCH", "Match ke bina message nahi ja sakta.");
        await chatService.send(matchId, text);
        void qc.invalidateQueries({ queryKey: qk.thread(matchId) });
        void qc.invalidateQueries({ queryKey: qk.conversations });
        void qc.invalidateQueries({ queryKey: ["lane"] });
        toast.success(`${first} ko message bhej diya`);
      } else {
        await reelService.attachNote(card.id, text);
        void qc.invalidateQueries({ queryKey: qk.interests });
        toast.success(`${first} ko note bhej diya`);
      }
      setDrafts((d) => ({ ...d, [key]: "" }));
      setStatus({ kind: "idle" });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setStatus({ kind: "locked", message: err.message || "Ye chat abhi khuli nahi hai — Open Chat par unlock ka raasta hai." });
      } else {
        setStatus({ kind: "error", message: errorMessage(err, "Nahi gaya — dobara try karein.") });
      }
    }
  }

  const locked = status.kind === "locked";
  const sending = status.kind === "sending";

  return (
    <BottomSheet
      visible={live !== null}
      onClose={onClose}
      title={mode === "message" ? `Message ${first}` : `Note for ${first}`}
      subtitle={mode === "message" ? "Rishta jud chuka hai — yahin se jawab bhejiye" : "Aapke interest ke saath jayega — Send dabane par hi"}
      footer={
        locked ? (
          matchId ? <PrimaryButton label="Open Chat" icon={MessageCircle} onPress={() => onOpenChat(matchId)} /> : null
        ) : (
          <View style={styles.row}>
            {mode === "message" && matchId ? (
              <GhostButton label="Open Chat" size="md" onPress={() => onOpenChat(matchId)} disabled={sending} />
            ) : null}
            <View style={styles.flex}>
              <PrimaryButton label="Send" icon={Send} size="md" loading={sending} disabled={!body.trim()} onPress={() => void send()} />
            </View>
          </View>
        )
      }
    >
      <View style={styles.stack}>
        {/* Whom it goes to — named, with their face, above every word. */}
        <View style={[styles.to, { backgroundColor: t.colors.chip }]} accessible accessibilityLabel={`To ${card.displayName}`}>
          <Avatar uri={card.photoUnlocked ? card.photoUrl : null} name={card.displayName} lock={card.photoUnlocked ? "open" : card.photoLock} size={34} />
          <View style={styles.flex}>
            <Text variant="caption" tone="muted">
              To
            </Text>
            <Text variant="bodyStrong" numberOfLines={1}>
              {card.displayName}
            </Text>
          </View>
        </View>

        {locked ? (
          <View style={[styles.box, { backgroundColor: t.colors.warnBg, borderColor: t.colors.warn }]} accessibilityRole="alert">
            <Icon icon={Lock} size={16} tone="warn" />
            <Text variant="small" style={styles.flex}>
              {status.message}
            </Text>
          </View>
        ) : (
          <>
            <Input
              value={body}
              onChangeText={setBody}
              multiline
              multilineHeight={110}
              maxLength={MAX[mode]}
              placeholder="Namaste…"
              accessibilityLabel={mode === "message" ? "Message" : "Note"}
              editable={!sending}
            />
            <View style={styles.tools}>
              <SecondaryButton label={suggesting ? "Suggesting…" : "Suggest a Line"} icon={Wand2} size="sm" fullWidth={false} loading={suggesting} onPress={() => void suggest()} disabled={sending} />
              <GhostButton
                label="Ask Grio"
                icon={Sparkles}
                size="sm"
                onPress={() => onAskGrio(card, mode === "message" ? `${first} ko bhejne ke liye ek achha message likhne me madad karo.` : `${first} ke liye interest ke saath ek chhota note likhne me madad karo.`)}
                disabled={sending}
              />
            </View>
            {suggestNote ? (
              <Text variant="caption" tone="muted">
                {suggestNote}
              </Text>
            ) : null}
            <Text variant="caption" tone="muted">
              {body.length}/{MAX[mode]} · Suggestion sirf box bharta hai — bhejna aapke Send se hi hota hai.
            </Text>
          </>
        )}

        {status.kind === "error" ? (
          <View style={styles.errorRow} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <Icon icon={CircleAlert} size={16} tone="danger" />
            <Text variant="smallStrong" tone="danger" style={styles.flex}>
              {status.message}
            </Text>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 12, paddingTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  to: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md },
  box: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  tools: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
