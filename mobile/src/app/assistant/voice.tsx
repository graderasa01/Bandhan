import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Keyboard, Mic, Square, Type } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { GhostButton, GlassCard, Icon, Input, PrimaryButton, Screen, ScreenHeader, SecondaryButton, Text, toast } from "~/components";
import { FIELD_BY_KEY, MINIMUM_LIVE_KEYS, isValidFieldValue } from "~/catalog";
import { ExtractionReview } from "~/features/assistant/ExtractionReview";
import { useVoiceClip } from "~/features/assistant/useVoiceClip";
import { useMyProfile } from "~/hooks/queries";
import { ai, AiError, type ExtractedValue } from "~/services/ai";
import { useTheme } from "~/theme";

type Phase = "ready" | "listening" | "transcribing" | "understanding" | "review";

const MORE_KEYS = ["motherTongue", "diet", "familyType", "fatherOccupation", "motherOccupation", "siblings", "hobbies", "partnerAgeRange"];

/**
 * Voice profile filling:  speak → transcript (server STT) → Grio reads the
 * catalog fields out of it (structured output, options-checked on the
 * server) → the member reviews → only confirmed values are saved.
 * Typing works the same way for anyone who would rather not speak.
 */
export default function VoiceFill() {
  const t = useTheme();
  const me = useMyProfile();
  // A clip cut at the limit is handled exactly as if Stop had been pressed.
  const voice = useVoiceClip(45_000, (clip) => void transcribeAndUnderstand(clip));
  const voiceOk = useQuery({ queryKey: ["voice-available"], queryFn: () => ai.voiceAvailable(), staleTime: 5 * 60_000 });
  const [mode, setMode] = useState<"voice" | "type">("voice");
  const [phase, setPhase] = useState<Phase>("ready");
  const [transcript, setTranscript] = useState("");
  const [values, setValues] = useState<ExtractedValue[]>([]);
  const [clarification, setClarification] = useState<string | null>(null);

  // No voice on the server: typing, whatever was picked.
  const shownMode = voiceOk.data === false ? "type" : mode;

  const known = useMemo(() => me.data?.values ?? {}, [me.data?.values]);
  const fillingFor = me.data?.fillingFor ?? "self";
  const forSelf = fillingFor === "self";
  const asked = useMemo(() => {
    const missing = [...MINIMUM_LIVE_KEYS, ...MORE_KEYS].filter((k) => {
      const def = FIELD_BY_KEY[k];
      return def && !isValidFieldValue(def, known[k]);
    });
    return missing.slice(0, 6);
  }, [known]);

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = phase === "listening" ? withRepeat(withTiming(1.12, { duration: 700 }), -1, true) : withTiming(1);
  }, [phase, pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  async function understand(text: string) {
    if (!text.trim()) return;
    setPhase("understanding");
    try {
      const res = await ai.extractProfile({ transcript: text, known, askedFields: asked.slice(0, 3), fillingFor });
      setValues(res.values);
      setClarification(res.clarification);
      setPhase("review");
    } catch (err) {
      toast.error(err instanceof AiError ? err.message : "Grio samajh nahi paaya — dobara try karein.");
      setPhase("ready");
    }
  }

  async function transcribeAndUnderstand(clip: Awaited<ReturnType<typeof voice.stop>>) {
    if (!clip) {
      setPhase("ready");
      return;
    }
    if (clip.durationMs < 1200) {
      toast.info("Thoda aur boliye — kam se kam do-teen baatein.");
      setPhase("ready");
      return;
    }
    setPhase("transcribing");
    try {
      const text = await ai.transcribe(clip, "hi-IN");
      if (!text) {
        toast.info("Kuch sunai nahi diya — mic ke paas boliye.");
        setPhase("ready");
        return;
      }
      setTranscript(text);
      await understand(text);
    } catch (err) {
      toast.error(err instanceof AiError ? err.message : "Awaaz samajh nahi aayi.");
      setMode("type");
      setPhase("ready");
    }
  }

  async function toggleMic() {
    if (phase === "listening") {
      const clip = await voice.stop();
      await transcribeAndUnderstand(clip);
      return;
    }
    const started = await voice.start();
    if (started) setPhase("listening");
    else toast.error("Microphone ki permission chahiye.");
  }

  const seconds = Math.floor(voice.durationMs / 1000);

  return (
    <Screen header={<ScreenHeader title="Fill with Voice" subtitle="Grio sunega, aap confirm karenge" />}>
      <View style={{ gap: 16 }}>
        <GlassCard padding={16}>
          <Text variant="h3">{forSelf ? "Apne baare me boliye" : "Unke baare me boliye"}</Text>
          <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
            Jaise baat karte hain waise hi — Hindi, Hinglish ya English. In baaton se shuru kijiye:
          </Text>
          <View style={styles.hints}>
            {(asked.length ? asked : MORE_KEYS.slice(0, 4)).map((k) => (
              <View key={k} style={[styles.hint, { borderColor: t.colors.rim, backgroundColor: t.colors.chip }]}>
                <Text variant="caption" tone="secondary">
                  {FIELD_BY_KEY[k]?.label ?? k}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: 10 }}>
            Jaise: “Main Priya, 27 saal, Pune me rehti hoon, CA hoon, family joint hai…”
          </Text>
        </GlassCard>

        {shownMode === "voice" ? (
          <View style={styles.micArea}>
            <Animated.View style={[styles.micRing, { borderColor: phase === "listening" ? t.colors.gold : t.colors.rim }, ring]}>
              <Pressable
                onPress={toggleMic}
                disabled={phase === "transcribing" || phase === "understanding"}
                accessibilityRole="button"
                accessibilityLabel={phase === "listening" ? "Stop recording" : "Start speaking"}
                style={[styles.mic, { backgroundColor: phase === "listening" ? t.colors.danger : t.colors.accent }]}
              >
                <Icon icon={phase === "listening" ? Square : Mic} size={40} color={t.colors.accentFg} />
              </Pressable>
            </Animated.View>
            <Text variant="bodyStrong" center>
              {phase === "listening"
                ? `Sun raha hoon… 0:${String(seconds).padStart(2, "0")}`
                : phase === "transcribing"
                  ? "Awaaz ko shabdon me badal raha hoon…"
                  : phase === "understanding"
                    ? "Grio samajh raha hai…"
                    : "Tap karke boliye"}
            </Text>
            {phase === "transcribing" || phase === "understanding" ? <ActivityIndicator color={t.colors.gold} /> : null}
            {voice.state === "denied" ? (
              <GhostButton label="Allow microphone in Settings" onPress={() => void Linking.openSettings()} />
            ) : null}
            <GhostButton label="Type instead" icon={Type} size="sm" onPress={() => setMode("type")} />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {voiceOk.data === false ? (
              <Text variant="small" tone="muted">
                Voice abhi available nahi hai — type karke bataiye, Grio waise hi samjhega.
              </Text>
            ) : null}
            <Input value={transcript} onChangeText={setTranscript} multiline multilineHeight={140} placeholder="Apne baare me likhiye…" />
            <PrimaryButton label="Understand" icon={Keyboard} onPress={() => void understand(transcript)} loading={phase === "understanding"} disabled={!transcript.trim()} />
            {voiceOk.data ? <GhostButton label="Speak instead" icon={Mic} size="sm" onPress={() => setMode("voice")} /> : null}
          </View>
        )}

        {transcript && shownMode === "voice" && phase === "review" ? (
          <GlassCard level="soft" padding={14}>
            <Text variant="caption" tone="muted">
              Aapne kaha
            </Text>
            <Text variant="body" style={{ marginTop: 4 }}>
              {transcript}
            </Text>
          </GlassCard>
        ) : null}

        {clarification && phase === "review" ? (
          <GlassCard active padding={14}>
            <Text variant="bodyStrong" tone="gold">
              Grio ka sawaal
            </Text>
            <Text variant="body" style={{ marginTop: 4 }}>
              {clarification}
            </Text>
          </GlassCard>
        ) : null}

        {phase === "review" && me.data ? (
          <ExtractionReview
            values={values}
            current={me.data.values}
            onSaved={() => {
              setValues([]);
              setTranscript("");
              setPhase("ready");
            }}
          />
        ) : null}

        {phase === "review" ? (
          <View style={{ gap: 10 }}>
            <SecondaryButton label="Say More" icon={Mic} onPress={() => setPhase("ready")} />
            <GhostButton label="Done — back to profile" onPress={() => (router.canGoBack() ? router.back() : router.replace("/setup"))} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hints: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  hint: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  micArea: { alignItems: "center", gap: 12, paddingVertical: 12 },
  micRing: { width: 132, height: 132, borderRadius: 66, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  mic: { width: 108, height: 108, borderRadius: 54, alignItems: "center", justifyContent: "center" },
});
