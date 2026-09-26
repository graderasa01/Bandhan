import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { KeyRound, Smartphone, User } from "lucide-react-native";
import { useState } from "react";
import { GhostButton, Input, PrimaryButton, Text, toast } from "~/components";
import { AuthShell } from "~/features/auth/AuthShell";
import { errorMessage } from "~/services/api/client";
import { authService } from "~/services/auth";
import { useSession } from "~/store/session";
import { parseContact } from "~/utils/contact";

const PASSWORD_MIN = 8;

/**
 * Create an account. Where a code can reach the contact, the contact is
 * proved first (OTP) and the account is made on the next step — no password
 * needed. Where none can (no SMS provider yet), the member sets a password,
 * exactly the web's rule: an account nobody can get back into is never made.
 */
export default function Register() {
  const signedIn = useSession((s) => s.signedIn);
  const channels = useQuery({ queryKey: ["otp-channels"], queryFn: authService.otpChannels, staleTime: 60_000 });
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseContact(contact);
  const otpPossible = parsed ? Boolean(channels.data?.[parsed.kind]) : true;

  async function submit() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Naam kam se kam 2 characters ka hona chahiye.");
      return;
    }
    if (!parsed) {
      setError("Valid 10-digit mobile number ya email daaliye.");
      return;
    }
    setBusy(true);
    try {
      if (otpPossible) {
        const res = await authService.sendOtp(parsed.value, "signup");
        if (res.ok) {
          if (res.existingUser) toast.info("Is number par account pehle se hai — code daalte hi login ho jayega.");
          router.push({ pathname: "/otp", params: { contact: parsed.value, masked: res.masked, flow: "signup", name: name.trim() } });
          return;
        }
        if (res.error !== "not_configured") {
          setError(res.message);
          return;
        }
        // No provider can send — fall through to the password path.
      }
      if (password.length < PASSWORD_MIN) {
        setError(`Password kam se kam ${PASSWORD_MIN} characters ka banaiye.`);
        return;
      }
      const user = await authService.register({ fullName: name, contact: parsed.value, password });
      signedIn(user);
      toast.success("Account ban gaya! Ab profile banate hain.");
      router.replace("/bolo");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your profile"
      subtitle="Do minute lagenge. Aap khud ke liye ya parivaar me kisi ke liye bana sakte hain."
      footer={<PrimaryButton label={otpPossible ? "Send OTP" : "Create Account"} onPress={submit} loading={busy} />}
    >
      <Input
        label="Aapka naam"
        icon={User}
        value={name}
        onChangeText={setName}
        placeholder="Jaise: Rahul Sharma"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
      />
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
        autoComplete="tel"
        hint={otpPossible ? "Is par ek code aayega — number confirm karne ke liye." : undefined}
      />
      {!otpPossible ? (
        <Input
          label="Password banaiye"
          icon={KeyRound}
          value={password}
          onChangeText={setPassword}
          placeholder={`Kam se kam ${PASSWORD_MIN} characters`}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          hint="OTP abhi available nahi hai, isliye login ke liye password chahiye."
        />
      ) : null}
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}
      <Text variant="caption" tone="muted" center>
        Continue karke aap BandhanTak ki Terms aur Privacy Policy maante hain.
      </Text>
      <GhostButton label="Already have an account? Login" size="sm" onPress={() => router.replace("/login")} />
    </AuthShell>
  );
}
