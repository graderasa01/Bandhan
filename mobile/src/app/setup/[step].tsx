import { router, useLocalSearchParams } from "expo-router";
import { CircleCheck, Pencil } from "lucide-react-native";
import { useRef } from "react";
import { StyleSheet, View, type ScrollView } from "react-native";
import {
  Chip,
  ErrorState,
  GhostButton,
  GlassCard,
  Icon,
  PrimaryButton,
  ProgressBar,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  toast,
} from "~/components";
import { FIELD_BY_KEY, isAnswered, isValidFieldValue } from "~/catalog";
import { PhotoManager } from "~/features/me/PhotoManager";
import { FieldEditor } from "~/features/profile-setup/inputs/FieldEditor";
import { formatDob } from "~/features/profile-setup/inputs/DateTimeFields";
import { SETUP_STEPS, STEP_BY_KEY, stepFields, type StepKey } from "~/features/profile-setup/steps";
import { useProfileDraft } from "~/features/profile-setup/useProfileDraft";
import { useSession } from "~/store/session";
import type { FillingFor } from "~/types/api";

const FOR_OPTIONS: Array<{ key: FillingFor; label: string }> = [
  { key: "self", label: "Khud ke liye" },
  { key: "son", label: "Bete ke liye" },
  { key: "daughter", label: "Beti ke liye" },
];

/** One small step of profile setup — its fields, autosaved, with a clear next action. */
export default function SetupStepScreen() {
  const { step: stepParam } = useLocalSearchParams<{ step: string }>();
  const step = STEP_BY_KEY[stepParam as StepKey] ?? SETUP_STEPS[0]!;
  const index = SETUP_STEPS.findIndex((s) => s.key === step.key);
  const nextKey = SETUP_STEPS[index + 1]?.key;
  const draft = useProfileDraft();
  const markActive = useSession((s) => s.markActive);
  const scroll = useRef<ScrollView>(null);

  const goNext = async () => {
    const { ok, res } = await draft.flush();
    if (!ok) {
      toast.error("Save nahi ho paaya — internet check karke dobara try karein.");
      return;
    }
    if (res?.justActivated) {
      markActive();
      router.replace("/setup/complete");
      return;
    }
    if (nextKey) router.replace(`/setup/${nextKey}`);
    else router.replace("/setup");
  };

  const goLive = async () => {
    const { ok, res } = await draft.flush();
    if (!ok) {
      toast.error("Save nahi ho paaya — internet check karke dobara try karein.");
      return;
    }
    // Nothing new to save? An empty save still makes the server re-check readiness.
    const checked = res ?? (await draft.recheck());
    if (checked?.isLive) {
      markActive();
      router.replace("/setup/complete");
    } else {
      toast.error("Kuch zaroori baatein baaki hain — upar dekhiye.");
    }
  };

  const saveLabel =
    draft.saveState === "saving" ? "Saving…" : draft.saveState === "saved" ? "Saved ✓" : draft.saveState === "error" ? "Not saved" : "";

  return (
    <Screen
      ref={scroll}
      header={
        <View>
          <ScreenHeader
            title={step.title}
            subtitle={`Step ${index + 1} of ${SETUP_STEPS.length}${saveLabel ? ` · ${saveLabel}` : ""}`}
            onBack={() => {
              void draft.flush();
              if (router.canGoBack()) router.back();
              else router.replace("/setup");
            }}
          />
          <View style={styles.progress}>
            <ProgressBar percent={((index + 1) / SETUP_STEPS.length) * 100} />
          </View>
        </View>
      }
      footer={
        step.key === "review" ? (
          <PrimaryButton label={draft.me.data?.isLive ? "Done" : "Go Live"} onPress={draft.me.data?.isLive ? () => router.replace("/setup/complete") : goLive} />
        ) : (
          <View style={{ gap: 6 }}>
            <PrimaryButton label={nextKey === "review" ? "Save & Review" : "Save & Continue"} onPress={goNext} loading={draft.saveState === "saving"} />
            {step.optional ? <GhostButton label="Skip for now" onPress={() => nextKey && router.replace(`/setup/${nextKey}`)} /> : null}
          </View>
        )
      }
    >
      <Text variant="body" tone="secondary" style={styles.hint}>
        {step.hint}
      </Text>

      {draft.me.isPending ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={140} radius={20} />
          <Skeleton height={140} radius={20} />
        </View>
      ) : draft.me.isError ? (
        <ErrorState error={draft.me.error} onRetry={() => void draft.me.refetch()} />
      ) : step.key === "photos" ? (
        <PhotoManager photos={draft.me.data.photos} name={draft.values.fullName ?? "Aap"} />
      ) : step.key === "review" ? (
        <Review values={draft.values} blockers={draft.me.data.readiness.blockers.map((b) => b.label)} live={draft.me.data.isLive} />
      ) : (
        <View style={{ gap: 14 }}>
          {step.key === "basic" ? (
            <GlassCard padding={16}>
              <Text variant="h3">Ye profile kiske liye hai?</Text>
              <View style={styles.forRow}>
                {FOR_OPTIONS.map((o) => (
                  <Chip key={o.key} label={o.label} size="sm" selected={draft.fillingFor === o.key} onPress={() => draft.setFillingFor(o.key)} />
                ))}
              </View>
            </GlassCard>
          ) : null}
          {stepFields(step).map((field) => (
            <FieldEditor
              key={field.key}
              field={field}
              value={draft.values[field.key] ?? ""}
              values={draft.values}
              fillingFor={draft.fillingFor}
              onChange={draft.set}
              showRequired
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function Review({ values, blockers, live }: { values: Record<string, string>; blockers: string[]; live: boolean }) {
  return (
    <View style={{ gap: 12 }}>
      {live ? (
        <GlassCard active padding={16}>
          <View style={styles.row}>
            <Icon icon={CircleCheck} size={22} tone="success" />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              Aapki profile live hai — rishte ab aapko dekh sakte hain.
            </Text>
          </View>
        </GlassCard>
      ) : blockers.length ? (
        <GlassCard padding={16}>
          <Text variant="bodyStrong" tone="gold">
            Live hone se pehle ye bharna zaroori hai
          </Text>
          <Text variant="body" tone="secondary" style={{ marginTop: 4 }}>
            {blockers.join(" · ")}
          </Text>
        </GlassCard>
      ) : null}
      {SETUP_STEPS.filter((s) => s.fields.length > 0).map((s) => {
        const rows = s.fields
          .map((k) => FIELD_BY_KEY[k])
          .filter((f): f is NonNullable<typeof f> => Boolean(f))
          .filter((f) => isAnswered(f, values));
        const missingRequired = s.fields.some((k) => {
          const f = FIELD_BY_KEY[k];
          return f?.required && !isValidFieldValue(f, values[k]);
        });
        return (
          <GlassCard key={s.key} padding={14} onPress={() => router.push(`/setup/${s.key}`)}>
            <View style={styles.row}>
              <Icon icon={s.icon} size={18} tone="gold" />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {s.title}
              </Text>
              {missingRequired ? (
                <Text variant="caption" tone="warn">
                  Baaki
                </Text>
              ) : null}
              <Icon icon={Pencil} size={16} tone="muted" />
            </View>
            {rows.length ? (
              <View style={styles.values}>
                {rows.map((f) => (
                  <Text key={f.key} variant="small" tone="secondary" numberOfLines={2}>
                    <Text variant="smallStrong">{f.label}: </Text>
                    {f.key === "dateOfBirth" ? formatDob(values[f.key]) : (values[f.key] ?? "").split(",").join(", ")}
                  </Text>
                ))}
              </View>
            ) : (
              <Text variant="small" tone="muted" style={{ marginTop: 6 }}>
                Abhi kuch nahi bhara
              </Text>
            )}
          </GlassCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { paddingHorizontal: 16, paddingBottom: 10, width: "100%", maxWidth: 520, alignSelf: "center" },
  hint: { marginBottom: 14 },
  forRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  values: { marginTop: 8, gap: 3 },
});
