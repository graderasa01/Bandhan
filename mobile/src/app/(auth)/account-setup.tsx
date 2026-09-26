import { router, useLocalSearchParams } from "expo-router";
import { User } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Chip, Input, PrimaryButton, Text, toast } from "~/components";
import { AuthShell } from "~/features/auth/AuthShell";
import { errorMessage } from "~/services/api/client";
import { authService } from "~/services/auth";
import { useSession } from "~/store/session";
import type { FillingFor } from "~/types/api";

const FOR_OPTIONS: Array<{ key: FillingFor; label: string }> = [
  { key: "self", label: "Khud ke liye" },
  { key: "son", label: "Bete ke liye" },
  { key: "daughter", label: "Beti ke liye" },
];

/**
 * The account step after a verified code: who the profile is for, and the
 * two answers every profile starts with. `/api/bolo/complete` turns the
 * proven contact into the account + session in one call (and, as on the web,
 * fills only what is empty for a contact that already had an account).
 */
export default function AccountSetup() {
  const params = useLocalSearchParams<{ contact: string; proof: string; name?: string }>();
  const signedIn = useSession((s) => s.signedIn);
  const [fillingFor, setFillingFor] = useState<FillingFor>("self");
  const [fullName, setFullName] = useState(params.name ?? "");
  const [gender, setGender] = useState<"Ladka" | "Ladki" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forSelf = fillingFor === "self";
  const resolvedGender = fillingFor === "son" ? "Ladka" : fillingFor === "daughter" ? "Ladki" : gender;

  async function submit() {
    setError(null);
    if (fullName.trim().length < 2) {
      setError(forSelf ? "Apna poora naam daaliye." : "Unka poora naam daaliye.");
      return;
    }
    if (!resolvedGender) {
      setError("Gender chuniye.");
      return;
    }
    setBusy(true);
    try {
      await authService.createAccount({
        contact: params.contact,
        proof: params.proof,
        accountName: (forSelf ? fullName : params.name || fullName).trim(),
        fillingFor,
        values: { fullName: fullName.trim(), gender: resolvedGender },
      });
      const user = await authService.session();
      if (user) signedIn(user);
      toast.success("Account ban gaya!");
      router.replace("/bolo");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Profile kiske liye hai?"
      subtitle="Number confirm ho gaya. Bas do baatein — baaki profile agle kadam me."
      back={false}
      footer={<PrimaryButton label="Continue" onPress={submit} loading={busy} />}
    >
      <View style={styles.chips}>
        {FOR_OPTIONS.map((o) => (
          <Chip key={o.key} label={o.label} selected={fillingFor === o.key} onPress={() => setFillingFor(o.key)} />
        ))}
      </View>
      <Input
        label={forSelf ? "Aapka poora naam" : fillingFor === "son" ? "Bete ka poora naam" : "Beti ka poora naam"}
        icon={User}
        value={fullName}
        onChangeText={setFullName}
        placeholder="Jaise: Rahul Sharma"
        autoCapitalize="words"
      />
      {forSelf ? (
        <View style={{ gap: 8 }}>
          <Text variant="smallStrong" tone="secondary">
            Gender
          </Text>
          <View style={styles.row}>
            <Chip label="Ladka" selected={gender === "Ladka"} onPress={() => setGender("Ladka")} block />
            <Chip label="Ladki" selected={gender === "Ladki"} onPress={() => setGender("Ladki")} block />
          </View>
        </View>
      ) : null}
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", gap: 10 },
});
