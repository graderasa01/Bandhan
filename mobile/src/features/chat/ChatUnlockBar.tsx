import { Gift, Lock } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Icon, PrimaryButton, SecondaryButton, Text } from "~/components";
import { layout, useTheme } from "~/theme";
import type { ChatUnlockQuote } from "~/types/api";
import { useChatUnlock } from "./useChatUnlock";

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function lockLine(quote: ChatUnlockQuote | undefined): string {
  switch (quote?.state) {
    case "unavailable":
      return quote.message;
    case "credit":
      return quote.welcome
        ? "Aapke partner ki taraf se pehli baatcheet free hai. Chat aap dono ke liye khulegi."
        : `Aapke paas ${quote.credits} free unlock hain. Chat aap dono ke liye khulegi.`;
    case "pay":
      return `${rupees(quote.pricePaise)} ek baar — sirf is rishte ke liye, aur chat aap dono ke liye khulegi.`;
    default:
      return "Ye chat abhi khuli nahi hai — ek Chat Unlock se aap dono ke liye khul jayegi.";
  }
}

function unlockLabel(quote: ChatUnlockQuote | undefined): string {
  if (quote?.state === "credit") return "Use Free Unlock";
  if (quote?.state === "pay") return `Unlock Chat ${rupees(quote.pricePaise)}`;
  return "Unlock Chat";
}

/**
 * Where the composer sits while a chat is locked (D-90) — the app's side of
 * the web's `ChatUnlockCard`, on the same endpoint. What it says follows the
 * server's quote (price, a held free unlock, or why it cannot open), and what
 * it offers follows `useChatUnlock`'s phase: one busy button while a checkout
 * is being created, a way back while the browser has it, and — if the member
 * returns before the server has seen the payment — a "check again" that never
 * pretends the chat is open.
 */
export function ChatUnlockBar({ matchId, bottomInset }: { matchId: string; bottomInset: number }) {
  const t = useTheme();
  const { quote, phase, error, start, checkAgain, returnedFromBrowser } = useChatUnlock(matchId);

  let status: string | null = null;
  if (phase === "browser") {
    status = "Payment browser me khuli hai. Pay karke yahan wapas aaiye — chat server ki pushti ke baad hi khulegi.";
  } else if (phase === "checking") {
    status = "Server se chat ka haal pooch rahe hain…";
  } else if (phase === "pending") {
    status = "Payment ki pushti abhi nahi hui. Paisa kat gaya ho to chat thodi der me khud khul jayegi — dobara pay mat kijiye.";
  }

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, 12), borderTopColor: t.colors.divider, backgroundColor: t.colors.tabBar }]}>
      <View style={styles.lockRow}>
        <Icon icon={quote?.state === "credit" ? Gift : Lock} size={18} tone="gold" />
        <Text variant="small" tone="secondary" style={{ flex: 1 }}>
          {lockLine(quote)}
        </Text>
      </View>

      {status ? (
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {status}
        </Text>
      ) : null}

      {phase === "browser" ? (
        <SecondaryButton label="Check Payment" size="md" onPress={returnedFromBrowser} />
      ) : phase === "pending" ? (
        <View style={styles.pair}>
          <PrimaryButton label="Check Again" size="md" onPress={() => void checkAgain()} />
          <SecondaryButton label="Try Payment Again" size="md" onPress={() => void start()} />
        </View>
      ) : quote?.state === "unavailable" ? null : (
        <PrimaryButton
          label={unlockLabel(quote)}
          size="md"
          loading={phase === "starting" || phase === "checking"}
          onPress={() => void start()}
        />
      )}

      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: layout.gutter, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  lockRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  pair: { gap: 8 },
});
