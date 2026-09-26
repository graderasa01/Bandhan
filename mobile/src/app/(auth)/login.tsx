import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { KeyRound, Smartphone } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { GhostButton, Input, PrimaryButton, Text, toast } from "~/components";
import { AuthShell } from "~/features/auth/AuthShell";
import { errorMessage } from "~/services/api/client";
import { authService } from "~/services/auth";
import { useSession } from "~/store/session";
import { parseContact } from "~/utils/contact";
import { firstNameOf } from "~/utils/names";

/**
 * Login — by one-time code where the server can send one (Twilio for SMS,
 * Resend for email; `/api/auth/otp/status` says which), by password always.
 * A number with no account is pointed at registration instead of being sent a
 * code to a dead end (the server refuses a `login` send for it anyway).
 */
export default function Login() {
  const signedIn = useSession((s) => s.signedIn);
  const channels = useQuery({ queryKey: ["otp-channels"], queryFn: authService.otpChannels, staleTime: 60_000 });
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);

  const parsed = parseContact(contact);
  const otpPossible = parsed ? Boolean(channels.data?.[parsed.kind]) : Boolean(channels.data?.mobile || channels.data?.email);
  const useOtp = mode === "otp" && otpPossible;

  async function submit() {
    setError(null);
    setNoAccount(false);
    if (!parsed) {
      setError("Valid 10-digit mobile number ya email daaliye.");
      return;
    }
    setBusy(true);
    try {
      if (useOtp) {
        const res = await authService.sendOtp(parsed.value, "login");
        if (res.ok) {
          router.push({ pathname: "/otp", params: { contact: parsed.value, masked: res.masked, flow: "login" } });
          return;
        }
        if (res.error === "no_account") {
          setNoAccount(true);
          setError("Is mobile/email se koi account nahi hai.");
        } else if (res.error === "not_configured") {
          setMode("password");
          setError("OTP abhi nahi ja sakta — password se login kijiye.");
        } else {
          setError(res.message);
        }
        return;
      }
      if (!password) {
        setError("Password daaliye.");
        return;
      }
      const user = await authService.loginWithPassword(parsed.value, password);
      signedIn(user);
      toast.success(`Welcome back, ${firstNameOf(user.full_name)}!`);
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Apne registered mobile number ya email se login karein."
      footer={<PrimaryButton label={useOtp ? "Send OTP" : "Login"} onPress={submit} loading={busy} />}
    >
      <Input
        label="Mobile number ya email"
        icon={Smartphone}
        value={contact}
        onChangeText={(v) => {
          setContact(v);
          setError(null);
        }}
        placeholder="98765 43210"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="username"
        textContentType="username"
        returnKeyType={useOtp ? "go" : "next"}
        onSubmitEditing={useOtp ? submit : undefined}
      />
      {!useOtp ? (
        <Input
          label="Password"
          icon={KeyRound}
          value={password}
          onChangeText={setPassword}
          placeholder="Aapka password"
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      ) : null}
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}
      {noAccount ? <GhostButton label="Create a new profile" onPress={() => router.replace("/bolo")} /> : null}
      <View style={styles.switch}>
        {otpPossible ? (
          <GhostButton
            size="sm"
            label={mode === "otp" ? "Use password instead" : "Login with OTP"}
            onPress={() => {
              setError(null);
              setMode(mode === "otp" ? "password" : "otp");
            }}
          />
        ) : (
          <Text variant="caption" tone="muted" center>
            OTP abhi available nahi hai — password se login karein.
          </Text>
        )}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  switch: { alignItems: "center" },
});
