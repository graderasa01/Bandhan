import { ArrowRight, CheckCircle2, Heart, Info, KeyRound, Sparkles, X } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Appear, GhostButton, GlassSurface, Icon, Input, PrimaryButton, SecondaryButton, Text } from "~/components";
import { PASSWORD_MIN_LENGTH, isAcceptablePassword } from "~/shared/passwordPolicy";
import { useTheme } from "~/theme";

/** A line the screen needs the member to read — dismissible, never modal. */
export const Notice = memo(function Notice({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <Appear from="above" distance={8} duration={220}>
      <GlassSurface level="soft" radius={18} style={styles.notice} accessibilityLiveRegion="polite">
        <Icon icon={Info} size={16} tone="gold" />
        <Text variant="small" style={{ flex: 1 }}>
          {text}
        </Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Icon icon={X} size={16} tone="muted" />
        </Pressable>
      </GlassSurface>
    </Appear>
  );
});

/** The two first-sitting preferences as the review shows them. */
export const PreferenceLines = memo(function PreferenceLines({ lines }: { lines: Array<{ key: string; label: string; value: string }> }) {
  if (lines.length === 0) return null;
  return (
    <GlassSurface level="soft" radius={16} style={styles.prefs}>
      <Text variant="smallStrong">Aapki pasand (profile ke saath save hogi)</Text>
      {lines.map((line) => (
        <Text key={line.key} variant="small" tone="secondary">
          <Text variant="small" tone="muted">
            {line.label}:{" "}
          </Text>
          {line.value}
        </Text>
      ))}
    </GlassSurface>
  );
});

/** "Apna password banayein" — offered once after the profile exists, to an account that has none. Optional, and it says so. */
export const SetPasswordCard = memo(function SetPasswordCard({
  value,
  onChange,
  saved,
  busy,
  error,
  onSave,
}: {
  value: string;
  onChange: (v: string) => void;
  saved: boolean;
  busy: boolean;
  error: string | null;
  onSave: () => void;
}) {
  const t = useTheme();
  if (saved) {
    return (
      <View style={[styles.savedPw, { backgroundColor: t.colors.successBg }]}>
        <Icon icon={CheckCircle2} size={18} tone="success" />
        <Text variant="small" tone="success" style={{ flex: 1 }}>
          Password ban gaya — ab login ID aur password se bhi login ho sakta hai.
        </Text>
      </View>
    );
  }
  return (
    <GlassSurface level="default" radius={20} style={styles.pwCard}>
      <View style={styles.pwHead}>
        <View style={[styles.pwIcon, { backgroundColor: t.colors.accentSoft }]}>
          <Icon icon={KeyRound} size={18} tone="gold" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Apna password banayein</Text>
          <Text variant="small" tone="secondary">
            OTP ke alawa password se bhi login kar payenge — kisi bhi phone par. Zaroori nahi, par achha rahega.
          </Text>
        </View>
      </View>
      <Input
        label="Apna password"
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint={`Kam se kam ${PASSWORD_MIN_LENGTH} characters. Kisi ko na batayein — Grio ko bhi nahi.`}
        error={error}
      />
      <SecondaryButton label="Save Password" loading={busy} disabled={!isAcceptablePassword(value)} onPress={onSave} />
    </GlassSurface>
  );
});

/** The finish: live or saved, the two preferences, the optional password, and the way on. */
export const DoneStep = memo(function DoneStep({
  live,
  preferences,
  showPassword,
  password,
  onPasswordChange,
  passwordSaved,
  passwordBusy,
  passwordError,
  onSavePassword,
  leaving,
  onContinue,
  grioListening,
}: {
  live: boolean;
  preferences: Array<{ key: string; label: string; value: string }>;
  showPassword: boolean;
  password: string;
  onPasswordChange: (v: string) => void;
  passwordSaved: boolean;
  passwordBusy: boolean;
  passwordError: string | null;
  onSavePassword: () => void;
  leaving: boolean;
  onContinue: () => void;
  grioListening: string | null;
}) {
  const t = useTheme();
  return (
    <View style={styles.done}>
      <Appear from="pop" style={[styles.seal, { borderColor: t.colors.gold, backgroundColor: t.colors.accentSoft }]}>
        <Icon icon={Sparkles} size={26} tone="gold" />
      </Appear>
      <Appear from="below" delay={120} duration={360} style={styles.doneText}>
        <Text variant="display" center>
          {live ? "Profile live hai 🎉" : "Account ban gaya"}
        </Text>
        <Text variant="body" tone="secondary" center>
          {live
            ? "Ab aapko rishte dikhne lagenge. Baaki details baad me bol kar bhar sakte hain."
            : "Profile draft save hai — bache hue sawaal andar poore kar lijiye."}
        </Text>
      </Appear>
      {preferences.length > 0 ? (
        <View style={styles.prefChips}>
          {preferences.map((line) => (
            <GlassSurface key={line.key} level="soft" radius={999} style={styles.prefChip}>
              <Icon icon={Heart} size={12} tone="gold" />
              <Text variant="caption" tone="secondary">
                {line.label}:
              </Text>
              <Text variant="caption">{line.value}</Text>
            </GlassSurface>
          ))}
        </View>
      ) : null}
      {showPassword ? (
        <SetPasswordCard value={password} onChange={onPasswordChange} saved={passwordSaved} busy={passwordBusy} error={passwordError} onSave={onSavePassword} />
      ) : null}
      <PrimaryButton label={live ? "See Matches" : "Continue"} iconRight={ArrowRight} loading={leaving} disabled={passwordBusy} onPress={onContinue} />
      {showPassword && !passwordSaved ? (
        <Text variant="caption" tone="muted" center>
          Abhi nahi? Baad me Settings me bhi bana sakte hain.
        </Text>
      ) : null}
      {grioListening ? (
        <Text variant="caption" tone="muted" center>
          {grioListening}
        </Text>
      ) : null}
    </View>
  );
});

/** "Save Draft & Create Account" etc. — the quiet link actions under a step. */
export function StepLink({ label, onPress }: { label: string; onPress: () => void }) {
  return <GhostButton label={label} size="sm" onPress={onPress} />;
}

const styles = StyleSheet.create({
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, paddingLeft: 14, paddingRight: 10 },
  prefs: { padding: 12, gap: 3 },
  savedPw: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 14 },
  pwCard: { padding: 16, gap: 14 },
  pwHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  pwIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  done: { gap: 18, paddingTop: 12 },
  seal: { alignSelf: "center", width: 58, height: 58, borderRadius: 29, borderWidth: 1.4, alignItems: "center", justifyContent: "center" },
  doneText: { gap: 8 },
  prefChips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  prefChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6 },
});
