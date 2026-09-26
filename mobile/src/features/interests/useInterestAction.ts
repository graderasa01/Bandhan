import { router } from "expo-router";
import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import { toast } from "~/components";
import { useSendInterest } from "~/hooks/queries";
import { errorMessage } from "~/services/api/client";
import { haptics } from "~/utils/haptics";
import { firstNameOf } from "~/utils/names";

/**
 * "Send Interest" from any card or profile — one behaviour everywhere: the
 * server's `sendInterest` (monthly quota, mutual match), a clear toast, and
 * when it turns into a match, the chat one tap away.
 */
export function useInterestAction() {
  const send = useSendInterest();

  const run = useCallback(
    async (profileId: string, name?: string) => {
      try {
        const res = await send.mutateAsync(profileId);
        if (res.matched && res.matchId) {
          haptics.success();
          const matchId = res.matchId;
          if (Platform.OS === "web") {
            toast.success("It's a match! 🎉 Chats me baat shuru kijiye.");
            return;
          }
          Alert.alert("It's a match! 🎉", `${name ? `${firstNameOf(name)} ne bhi` : "Unhone bhi"} aapko pasand kiya hai. Ab baat shuru kar sakte hain.`, [
            { text: "Later", style: "cancel" },
            { text: "Say Hello", onPress: () => router.push(`/chat/${matchId}`) },
          ]);
        } else {
          haptics.tap();
          toast.success("Interest bhej diya");
        }
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    [send],
  );

  return { sendInterest: run, pending: send.isPending };
}
