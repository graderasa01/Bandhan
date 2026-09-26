import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { GhostButton, PrimaryButton, Text, toast } from "~/components";
import { AuthShell } from "~/features/auth/AuthShell";
import { errorMessage } from "~/services/api/client";
import { authService } from "~/services/auth";
import { IS_MOCK } from "~/services/config";
import { MOCK_OTP } from "~/mocks/mockDb";
import { useSession } from "~/store/session";
import { fonts, radius, useTheme } from "~/theme";
import { haptics } from "~/utils/haptics";
import { firstNameOf } from "~/utils/names";

const LENGTH = 6;
const RESEND_SECONDS = 60;

/**
 * The 6-digit code (the server accepts nothing else). Verified with
 * `login: true`: a contact that already has an account is simply signed in;
 * a new one comes back with a short-lived proof for the account step.
 */
export default function Otp() {
  const t = useTheme();
  const params = useLocalSearchParams<{ contact: string; masked?: string; flow?: string; name?: string }>();
  const signedIn = useSession((s) => s.signedIn);
  const input = useRef<TextInput>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function verify(value: string) {
    if (value.length !== LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authService.verifyOtp(params.contact, value);
      if (!res.ok) {
        haptics.warn();
        setError(res.message);
        setCode("");
        return;
      }
      haptics.success();
      if (res.loggedIn) {
        signedIn(res.user);
        toast.success(`Welcome, ${firstNameOf(res.user.full_name)}!`);
        router.replace("/");
        return;
      }
      router.replace({ pathname: "/account-setup", params: { contact: params.contact, proof: res.proof, name: params.name ?? "" } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      const res = await authService.sendOtp(params.contact, params.flow === "login" ? "login" : "signup");
      if (res.ok) {
        toast.success("Naya code bhej diya");
        setWait(RESEND_SECONDS);
      } else {
        setError(res.message);
        if (res.retryAfterSeconds) setWait(res.retryAfterSeconds);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <AuthShell
      title="Code daaliye"
      subtitle={`Humne ${params.masked ?? "aapke number"} par 6-digit code bheja hai.`}
      footer={<PrimaryButton label="Verify" onPress={() => verify(code)} loading={busy} disabled={code.length !== LENGTH} />}
    >
      <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Enter the 6-digit code" style={styles.boxes}>
        {Array.from({ length: LENGTH }, (_, i) => {
          const filled = i < code.length;
          const current = i === code.length;
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: t.colors.input,
                  borderColor: error ? t.colors.danger : current ? t.colors.gold : filled ? t.colors.rim : t.colors.hairline,
                  borderWidth: current ? 1.8 : 1,
                },
              ]}
            >
              <Text variant="h2" style={{ fontFamily: fonts.semibold }} maxFontSizeMultiplier={1.1}>
                {code[i] ?? ""}
              </Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, "").slice(0, LENGTH);
          setCode(digits);
          setError(null);
          if (digits.length === LENGTH) void verify(digits);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={LENGTH}
        style={styles.hidden}
        accessibilityLabel="One-time code"
      />
      {error ? (
        <Text variant="small" tone="danger" center>
          {error}
        </Text>
      ) : null}
      {IS_MOCK ? (
        <Text variant="caption" tone="muted" center>
          Demo code: {MOCK_OTP}
        </Text>
      ) : null}
      <View style={styles.resend}>
        {wait > 0 ? (
          <Text variant="small" tone="muted" center>
            Code nahi aaya? {wait}s me dobara bhej sakte hain
          </Text>
        ) : (
          <GhostButton label="Resend Code" onPress={resend} />
        )}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  box: { flex: 1, aspectRatio: 0.82, maxWidth: 54, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  hidden: { position: "absolute", opacity: 0, height: 1, width: 1 },
  resend: { alignItems: "center", minHeight: 44, justifyContent: "center" },
});
