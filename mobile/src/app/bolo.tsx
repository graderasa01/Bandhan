import { useQuery } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { router, useFocusEffect } from "expo-router";
import { ArrowRight, ListChecks, LogOut } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AnswerChips,
  Appear,
  BottomSheet,
  EmptyState,
  ErrorState,
  GhostButton,
  GlassQuestionCard,
  Icon,
  PrimaryButton,
  ProgressBar,
  RoomBackground,
  Text,
} from "~/components";
import { BootSplash } from "~/features/boot/BootSplash";
import { AnswerBubble, type BubbleContent } from "~/features/bolo/components/AnswerBubble";
import { AnswerComposer, type ComposerMicState } from "~/features/bolo/components/AnswerComposer";
import { BoloHeader } from "~/features/bolo/components/BoloHeader";
import { BoloShell } from "~/features/bolo/components/BoloShell";
import { DoneStep, Notice, PreferenceLines, StepLink } from "~/features/bolo/components/BoloSteps";
import { ContactStep } from "~/features/bolo/components/ContactStep";
import { LiveVoiceBar, type VoiceBarMode } from "~/features/bolo/components/LiveVoiceBar";
import { ProfileFillCard } from "~/features/bolo/components/ProfileFillCard";
import { ProfileRow } from "~/features/bolo/components/ProfileRow";
import { useBoloFlow } from "~/features/bolo/useBoloFlow";
import { ProfileFieldSheet } from "~/features/profile-question/ProfileFieldSheet";
import { boloService, type BoloBoot } from "~/services/bolo";
import { useSession } from "~/store/session";
import { FILLING_FOR_ASK, chipFor, displayDate } from "~/shared/bolo/questions";
import { MINIMUM_LIVE_KEYS, labelsFor, missingPreferences, type BoloPreferenceKey } from "~/shared/bolo/draft";
import { FIELD_BY_KEY } from "~/catalog/fields";
import { layout, useTheme } from "~/theme";

/**
 * Bolo — "Bol kar profile banayein": the native form of the web's `/bolo`,
 * and the one place an unfinished profile gets finished.
 *
 *   - Signed out: a visitor. Profile first, then a number and a code (or a
 *     password where no code can reach it), then the account.
 *   - Signed in, profile not live: a member. Grio starts from what the profile
 *     holds and asks only the rest; no number, no code, no second account.
 *   - Anyone else is sent home.
 *
 * A conversation, not a form. Top to bottom: the mark and the 3/8 beads, one
 * slim line for the live voice, the profile folded to one row, the question
 * Grio is on, the latest accepted answer, the answers that can be tapped — and
 * one composer at the foot to type or pause the mic. The full card becomes the
 * review. "Open Full Form" is the manual editor, for whoever prefers it.
 */
export default function BoloScreen() {
  // Who is here is decided once per visit. A visitor who finishes becomes a
  // signed-in member on this very screen — re-asking then would answer "not
  // incomplete" and bounce them off their own done step.
  const [visit] = useState(() => `${Date.now()}-${Math.random()}`);
  const boot = useQuery({
    queryKey: ["bolo-boot", visit],
    queryFn: boloService.boot,
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (boot.isPending) return <BootSplash />;
  if (boot.isError) {
    return (
      <View style={styles.center}>
        <RoomBackground />
        <ErrorState error={boot.error} onRetry={() => void boot.refetch()} />
      </View>
    );
  }
  if (boot.data.kind === "notIncomplete") return <NotIncomplete />;
  return <BoloConversation boot={boot.data.boot} refetchBoot={async () => (await boot.refetch()).data} />;
}

/**
 * The server says this account has nothing left to finish here (live — say,
 * finished on the web meanwhile — or not a member account). The anchor route
 * decides from the session store, so the store must hear it first: sent back
 * with a stale "incomplete", the anchor would send the member straight here
 * again, round and round. An account the member app has no home for (the
 * server says done, the session still says unfinished) gets a way out instead
 * of a loop.
 */
function NotIncomplete() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await useSession.getState().refresh();
      if (cancelled) return;
      if (user?.status === "ACTIVE") router.replace("/");
      else setStuck(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!stuck) return <BootSplash />;
  return (
    <View style={styles.center}>
      <RoomBackground />
      <EmptyState
        icon={LogOut}
        title="Is account se member profile nahi banti"
        description="Ye app rishta dhoondhne wale members ke liye hai. Doosre account se login karke dekhiye."
        actionLabel="Log Out"
        onAction={() => void useSession.getState().signOut().then(() => router.replace("/"))}
      />
    </View>
  );
}

type RefetchBoot = () => Promise<Awaited<ReturnType<typeof boloService.boot>> | undefined>;

function BoloConversation({ boot, refetchBoot }: { boot: BoloBoot; refetchBoot: RefetchBoot }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const flow = useBoloFlow(boot);
  const scroll = useRef<ScrollView>(null);
  const composer = useRef<TextInput>(null);
  const questionY = useRef(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [composerHeight, setComposerHeight] = useState(84);
  const firstFocus = useRef(true);

  const { member, draft, stage, conversing, missing, isComplete, ask } = flow;

  // Back from the full form: whatever it saved is the profile now.
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (!member) return;
      void refetchBoot().then(async (fresh) => {
        // The full form finished it (live now): this conversation is over —
        // once the session store knows, or the anchor would send them back here.
        if (fresh?.kind === "notIncomplete") {
          await useSession.getState().refresh();
          router.replace("/");
        } else if (fresh?.kind === "ok" && fresh.boot.member) flow.mergeServerMember(fresh.boot.member);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [member]),
  );

  // "+ Doosra shehar": the keyboard, on the composer.
  useEffect(() => {
    if (flow.focusComposer > 0) composer.current?.focus();
  }, [flow.focusComposer]);

  // With the keyboard up, the question and its chips are what must stay in view.
  useEffect(() => {
    const sub = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => {
      if (stage === "start" || stage === "talking") scroll.current?.scrollTo({ y: Math.max(0, questionY.current - 12), animated: true });
    });
    return () => sub.remove();
  }, [stage]);

  const total = MINIMUM_LIVE_KEYS.length;
  const doneCount = total - missing.length;
  const hasAnswers = Object.keys(draft.values).length > 0;

  const preferenceLines = useMemo(
    () =>
      (Object.entries(flow.savedPreferences) as Array<[BoloPreferenceKey, string]>).map(([key, value]) => ({
        key,
        label: FIELD_BY_KEY[key]?.label ?? key,
        value,
      })),
    [flow.savedPreferences],
  );

  const answerText = (key: string, value: string): string => {
    if (key === "dateOfBirth") return displayDate(value);
    return chipFor(key, value, draft.values)?.label ?? value;
  };

  let bubble: BubbleContent | null = null;
  const latest = flow.latest;
  if (latest?.kind === "sent") bubble = { id: latest.id, text: latest.text, state: "sent" };
  else if (latest?.kind === "accepted") {
    const parts = [
      ...(latest.fillingFor ? [answerText(FILLING_FOR_ASK, latest.fillingFor)] : []),
      ...latest.keys.filter((key) => !(key === "gender" && latest.fillingFor)).map((key) => answerText(key, latest.values[key] ?? "")),
    ];
    if (parts.length > 0) {
      bubble = { id: latest.id, text: parts.length > 2 ? `${parts.slice(0, 2).join(", ")} +${parts.length - 2}` : parts.join(", "), state: "accepted" };
    }
  }

  const memberGreeting = member ? ["Namaste", member.firstName].filter(Boolean).join(" ") : "";
  const memberTitle = !member
    ? null
    : missing.length >= total
      ? `${memberGreeting}, chaliye profile banate hain`
      : missing.length === 0
        ? `${memberGreeting} — profile ki zaroori baatein poori hain`
        : missing.length === 1
          ? `${memberGreeting} — bas 1 baat baaki hai`
          : `${memberGreeting} — bas ${missing.length} baatein baaki hain`;

  const askHint = !ask
    ? null
    : flow.rejected && flow.rejected.key === ask.key
      ? `“${flow.rejected.heard}” — ye theek se samajh nahi aaya, ek baar phir bataiye`
      : ask.optional
        ? "Isse rishte aapki pasand ke hisaab se chunenge — abhi nahi bhi chalega."
        : ask.chips.length > 0
          ? flow.voiceSupported
            ? "Tap karein, likhein, ya bol dein"
            : "Tap karein ya likh dein"
          : (ask.hint ?? null);

  const card = ask
    ? {
        id: ask.key,
        question: ask.question,
        hint: askHint,
        eyebrow: ask.optional ? "Zaroori baatein poori — bas 2 aakhri sawaal" : stage === "start" ? memberTitle : null,
      }
    : stage === "review"
      ? { id: "review", question: "Ek baar dekh lijiye — sab sahi hai?", hint: "Kuch galat ho to us line par tap karke badal dijiye.", eyebrow: null }
      : stage === "contact" && !member
        ? {
            id: "contact",
            question: isComplete ? "Bas ek number, aur profile live" : "Number dijiye, draft save ho jayega",
            hint: "Isi se aap wapas login karenge.",
            eyebrow: null,
          }
        : null;

  const chips = ask
    ? ask.chips.map((chip, index) => ({
        id: String(index),
        label: chip.label,
        selected: chip.value === null ? undefined : ask.key === FILLING_FOR_ASK ? draft.fillingFor === chip.value : draft.values[ask.key] === chip.value,
      }))
    : [];

  const barMode: VoiceBarMode = flow.leaving ? "leaving" : flow.liveActive ? "live" : !flow.voiceSupported ? "off" : flow.dropped ? "retry" : "idle";
  const voiceState = !flow.liveActive ? "idle" : flow.liveStatus === "connecting" ? "connecting" : flow.liveStatus === "speaking" ? "speaking" : "listening";
  const micState: ComposerMicState = !flow.liveActive
    ? "idle"
    : flow.liveStatus === "connecting"
      ? "connecting"
      : flow.muted
        ? "muted"
        : flow.liveStatus === "speaking"
          ? "speaking"
          : "listening";
  const showComposer = !flow.leaving && (conversing || stage === "review" || (stage === "done" && flow.liveActive));

  const accountLine = member ? (
    <View style={styles.accountRow}>
      <Text variant="small" tone="muted">
        Login: <Text variant="smallStrong">{member.fullName}</Text>
      </Text>
      <Pressable onPress={() => void flow.logout()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Log out" style={styles.logout}>
        <Icon icon={LogOut} size={14} tone="gold" />
        <Text variant="smallStrong" tone="gold">
          Log out
        </Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.accountRow}>
      <Text variant="small" tone="muted">
        Pehle se account hai?
      </Text>
      <Pressable onPress={() => router.push("/login")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Login">
        <Text variant="smallStrong" tone="gold">
          Login
        </Text>
      </Pressable>
    </View>
  );

  if (!flow.hydrated) return <BootSplash />;

  return (
    <View style={[styles.root, { backgroundColor: t.colors.background }]}>
      <RoomBackground />
      <StatusBar style={t.statusBar} />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "web" ? undefined : "padding"}>
        <View style={[styles.stage, { marginTop: insets.top + 6, marginBottom: Math.max(insets.bottom, 8) + 6 }]}>
          <BoloShell voice={voiceState} />
          <ScrollView
            ref={scroll}
            style={styles.root}
            contentContainerStyle={[styles.content, { paddingBottom: showComposer ? composerHeight + 22 : 34 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            showsVerticalScrollIndicator={false}
          >
            <BoloHeader done={doneCount} total={total} />

            <View style={styles.bars}>
              {stage !== "done" || flow.liveActive || flow.leaving ? (
                <LiveVoiceBar
                  mode={barMode}
                  status={flow.liveStatus}
                  level={flow.level}
                  muted={flow.muted}
                  heard={flow.userNow}
                  said={flow.grioNow}
                  onStart={() => void flow.startVoice()}
                  onStop={flow.stopVoice}
                />
              ) : null}
              {flow.notice ? <Notice text={flow.notice} onClose={() => flow.setNotice(null)} /> : null}
              {conversing || stage === "contact" ? <ProfileRow done={doneCount} onOpen={() => flow.setSheetOpen(true)} /> : null}
            </View>

            <View style={styles.main} onLayout={(e) => (questionY.current = e.nativeEvent.layout.y)}>
              {card ? (
                <View>
                  <GlassQuestionCard
                    id={card.id}
                    question={card.question}
                    hint={card.hint}
                    eyebrow={card.eyebrow}
                    ack={conversing ? flow.ack : null}
                    live={flow.liveActive}
                  />
                </View>
              ) : null}

              {conversing ? (
                <>
                  <AnswerBubble content={bubble} />
                  {ask ? (
                    <View key={ask.key} style={bubble ? styles.chipsAfterBubble : styles.chipsAlone}>
                      <AnswerChips chips={chips} label={card?.question ?? ""} disabled={flow.leaving} onPick={(id) => flow.pickChip(ask.key, Number(id))} />
                    </View>
                  ) : null}
                  {stage === "start" && !hasAnswers ? (
                    <Appear from="none" delay={300} style={styles.privacy}>
                      <Text variant="small" tone="secondary" center>
                        Aapki baatein sirf profile bharne ke liye — kisi ko dikhengi nahi jab tak aap live na karein.
                      </Text>
                      {accountLine}
                    </Appear>
                  ) : null}
                </>
              ) : null}

              {stage === "review" ? (
                <Appear from="below" distance={16} duration={360} style={styles.review}>
                  <ProfileFillCard values={draft.values} fillingFor={draft.fillingFor} editable onEdit={setEditing} highlight={flow.highlight} level="strong" />
                  <PreferenceLines lines={preferenceLines} />
                  {member ? (
                    <PrimaryButton label="All Correct — Go Live" iconRight={ArrowRight} disabled={!isComplete} loading={flow.busy} onPress={() => void flow.memberGoLive()} />
                  ) : (
                    <PrimaryButton label="All Correct — Continue" iconRight={ArrowRight} disabled={!isComplete} onPress={flow.confirmReview} />
                  )}
                  {!isComplete ? (
                    <Text variant="small" tone="muted" center>
                      Abhi baaki: {labelsFor(missing).join(", ")}
                    </Text>
                  ) : null}
                  {!isComplete && !member ? <StepLink label="Save Draft & Create Account" onPress={flow.goToContact} /> : null}
                  {member ? <View style={styles.reviewFoot}>{accountLine}</View> : null}
                </Appear>
              ) : null}

              {stage === "contact" && !member ? (
                <Appear from="below" distance={16} duration={320} style={styles.contact}>
                  <ContactStep
                    fillingFor={draft.fillingFor}
                    contact={flow.contact}
                    onContactChange={flow.setContact}
                    accountName={flow.accountName}
                    onAccountNameChange={flow.setAccountName}
                    code={flow.code}
                    onCodeChange={flow.setCode}
                    password={flow.accountPassword}
                    onPasswordChange={flow.setAccountPassword}
                    complete={isComplete}
                    otp={flow.otp}
                    busy={flow.busy}
                    channels={flow.channels}
                    onSend={() => void flow.uiSendOtp()}
                    onVerify={(c) => void flow.uiVerify(c)}
                    onFinishWithoutOtp={() => void flow.uiFinish()}
                  />
                  <PreferenceLines lines={preferenceLines} />
                  {flow.otp.phase === "verified" ? (
                    <PrimaryButton label={isComplete ? "Make Profile Live" : "Save Draft & Continue"} iconRight={ArrowRight} loading={flow.busy} onPress={() => void flow.uiFinish()} />
                  ) : null}
                  {flow.notice?.includes("login") ? <StepLink label="Go to Login" onPress={() => router.push("/login")} /> : null}
                </Appear>
              ) : null}

              {stage === "done" && flow.done ? (
                <DoneStep
                  live={flow.done.live}
                  preferences={preferenceLines}
                  showPassword={!flow.done.hasPassword}
                  password={flow.newPassword}
                  onPasswordChange={flow.setNewPassword}
                  passwordSaved={flow.passwordSaved}
                  passwordBusy={flow.passwordBusy}
                  passwordError={flow.passwordError}
                  onSavePassword={() => void flow.savePassword(true)}
                  leaving={flow.leaving}
                  onContinue={() => void flow.continueFromDone()}
                  grioListening={
                    flow.liveActive && !flow.leaving
                      ? missingPreferences(draft.values).length > 0
                        ? "Grio abhi bhi sun rahi hai — 2 pasand bata sakte hain, ya seedha aage badhein."
                        : "Grio abhi bhi sun rahi hai — kuch aur poochhna ho to poochh lijiye."
                      : null
                  }
                />
              ) : null}
            </View>
          </ScrollView>

          {showComposer ? (
            <View style={styles.dock} onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)} pointerEvents="box-none">
              <AnswerComposer
                ref={composer}
                value={flow.typed}
                onChange={flow.setTyped}
                onSubmit={() => void flow.submitTyped()}
                placeholder={flow.composerHint ?? (stage === "done" ? "Ya yahan likh dijiye — Grio padh legi" : "Jawab likhein…")}
                busy={flow.extracting}
                mic={flow.voiceSupported ? { state: micState, onPress: flow.pressMic } : null}
              />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={flow.sheetOpen}
        onClose={() => flow.setSheetOpen(false)}
        title={draft.fillingFor === "son" ? "Bete ki profile" : draft.fillingFor === "daughter" ? "Beti ki profile" : "Aapki profile"}
        subtitle={`${doneCount}/${total} bhar gaye`}
        footer={
          <View style={styles.sheetFoot}>
            {!member && !isComplete && hasAnswers && stage !== "contact" ? <StepLink label="Save Draft & Create Account" onPress={flow.goToContact} /> : null}
            {member ? <GhostButton label="Open Full Form" icon={ListChecks} size="sm" onPress={() => void flow.openFullForm()} /> : null}
            {accountLine}
          </View>
        }
      >
        <View style={styles.sheetBody}>
          <ProgressBar percent={(doneCount / total) * 100} />
          <ProfileFillCard
            values={draft.values}
            fillingFor={draft.fillingFor}
            editable
            onEdit={(key) => {
              flow.setSheetOpen(false);
              setEditing(key);
            }}
            highlight={flow.highlight}
            showHeader={false}
            level="soft"
          />
        </View>
      </BottomSheet>

      <ProfileFieldSheet
        fieldKey={editing}
        visible={editing !== null}
        value={editing ? (draft.values[editing] ?? "") : ""}
        values={draft.values}
        fillingFor={draft.fillingFor ?? "self"}
        context="bolo"
        onClose={() => setEditing(null)}
        onSave={(key, value) => flow.editField(key, value)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: "center", paddingHorizontal: layout.gutter },
  stage: { flex: 1, width: "100%", maxWidth: 480, alignSelf: "center", paddingHorizontal: 5 },
  content: { paddingHorizontal: 14, paddingTop: 6 },
  bars: { marginTop: 15, gap: 13 },
  main: { marginTop: 15 },
  chipsAfterBubble: { marginTop: 12 },
  chipsAlone: { marginTop: 22 },
  privacy: { marginTop: 40, gap: 10, paddingHorizontal: 8 },
  accountRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" },
  logout: { flexDirection: "row", alignItems: "center", gap: 4 },
  review: { marginTop: 22, gap: 16 },
  reviewFoot: { paddingTop: 4 },
  contact: { marginTop: 22, gap: 16 },
  dock: { position: "absolute", left: 5 + 8, right: 5 + 8, bottom: 14 },
  sheetFoot: { gap: 10, alignItems: "flex-start" },
  sheetBody: { gap: 14 },
});
