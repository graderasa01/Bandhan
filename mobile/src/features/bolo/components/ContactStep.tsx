import { CheckCircle2, KeyRound, MessageSquareText, Smartphone, User } from "lucide-react-native";
import { memo, useEffect, useRef } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { GhostButton, GlassSurface, Icon, Input, PrimaryButton, Text } from "~/components";
import { PASSWORD_MIN_LENGTH, isAcceptablePassword } from "~/shared/passwordPolicy";
import type { FillingFor } from "~/types/api";
import type { OtpState } from "../useBoloFlow";

/**
 * The only form in Bolo: where the account gets its number — after the
 * profile, on purpose (the web's `ContactStep`). A contact a code can reach
 * gets a code (and the SMS code fills itself on Android via the keyboard's
 * one-time-code suggestion); a contact no code can reach goes straight to a
 * password of the person's own — never generated, never read out to Grio —
 * because an account nobody can get back into is never made.
 */
export const ContactStep = memo(function ContactStep({
  fillingFor,
  contact,
  onContactChange,
  accountName,
  onAccountNameChange,
  code,
  onCodeChange,
  password,
  onPasswordChange,
  complete,
  otp,
  busy,
  channels,
  onSend,
  onVerify,
  onFinishWithoutOtp,
}: {
  fillingFor: FillingFor | null;
  contact: string;
  onContactChange: (v: string) => void;
  accountName: string;
  onAccountNameChange: (v: string) => void;
  code: string;
  onCodeChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  complete: boolean;
  otp: OtpState;
  busy: boolean;
  channels: { mobile: boolean; email: boolean };
  onSend: () => void;
  onVerify: (code: string) => void;
  onFinishWithoutOtp: () => void;
}) {
  const forChild = fillingFor === "son" || fillingFor === "daughter";
  const isEmail = contact.includes("@");
  const codeCanReach = isEmail ? channels.email : channels.mobile;
  const needsPassword = otp.phase === "skipped" || (otp.phase === "enter" && !codeCanReach);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (otp.phase === "sent") codeRef.current?.focus();
  }, [otp.phase]);

  if (otp.phase === "verified") {
    return (
      <View style={styles.verified}>
        <Icon icon={CheckCircle2} size={20} tone="success" />
        <Text variant="bodyStrong" tone="success" style={{ flex: 1 }}>
          {otp.masked} — confirm ho gaya
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.col}>
      {forChild ? (
        <Input
          label="Aapka apna naam"
          icon={User}
          value={accountName}
          onChangeText={onAccountNameChange}
          autoComplete="name"
          textContentType="name"
          placeholder="Jaise: Sunita Sharma"
          editable={otp.phase !== "sent"}
        />
      ) : null}

      <Input
        label="Mobile number ya email"
        icon={Smartphone}
        value={contact}
        onChangeText={onContactChange}
        keyboardType={isEmail ? "email-address" : "phone-pad"}
        autoCapitalize="none"
        autoComplete={needsPassword ? "username" : "tel"}
        textContentType={needsPassword ? "username" : "telephoneNumber"}
        placeholder="98765 43210"
        hint={codeCanReach ? "Yehi aapki login ID hai — OTP isi par aayega." : "Yehi aapki login ID hai."}
        error={otp.phase === "enter" ? otp.error : null}
        editable={otp.phase !== "sent"}
      />

      {otp.phase === "enter" && codeCanReach ? <PrimaryButton label="Send OTP" icon={MessageSquareText} loading={busy} onPress={onSend} /> : null}

      {needsPassword ? (
        <View style={styles.col}>
          <GlassSurface level="soft" nested radius={14} style={styles.note}>
            <Icon icon={KeyRound} size={16} tone="gold" />
            <Text variant="small" tone="secondary" style={{ flex: 1 }}>
              {isEmail
                ? "Is email par abhi OTP nahi ja sakta — isliye apna ek password bana lijiye. Isi email aur password se login karenge."
                : "Is number par abhi OTP nahi ja sakta — isliye apna ek password bana lijiye. Isi number aur password se login karenge."}
            </Text>
          </GlassSurface>
          <Input
            label="Apna password"
            icon={KeyRound}
            value={password}
            onChangeText={onPasswordChange}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            hint={`Kam se kam ${PASSWORD_MIN_LENGTH} characters. Kisi ko na batayein — Grio ko bhi nahi.`}
          />
          <PrimaryButton
            label={complete ? "Make Profile Live" : "Save Draft & Continue"}
            loading={busy}
            disabled={!contact.trim() || !isAcceptablePassword(password)}
            onPress={onFinishWithoutOtp}
          />
        </View>
      ) : null}

      {otp.phase === "sent" ? (
        <GlassSurface level="soft" nested radius={16} style={styles.codeBox}>
          <Text variant="body">
            Code bheja gaya: <Text variant="bodyStrong">{otp.masked}</Text>
          </Text>
          {otp.existingUser ? (
            <Text variant="small" tone="secondary">
              Is number se account pehle se hai — code daalte hi usi me login ho jayega.
            </Text>
          ) : null}
          <Input
            ref={codeRef}
            label="6-digit OTP"
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, "").slice(0, 6);
              onCodeChange(digits);
              if (digits.length === 6) onVerify(digits);
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
            placeholder="••••••"
            error={otp.error}
          />
          <PrimaryButton label="Verify & Go Live" loading={busy} disabled={code.length !== 6} onPress={() => onVerify(code)} />
          <GhostButton label={otp.cooldown > 0 ? `Resend in ${otp.cooldown}s` : "Resend OTP"} disabled={busy || otp.cooldown > 0} onPress={onSend} />
        </GlassSurface>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  col: { gap: 14 },
  verified: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12 },
  codeBox: { gap: 12, padding: 14 },
});
