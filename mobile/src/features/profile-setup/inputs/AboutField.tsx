import { Sparkles } from "lucide-react-native";
import { memo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Chip, GlassCard, Input, SecondaryButton, Text, toast } from "~/components";
import { COMPOSE_CARDS, composeAboutMe } from "~/catalog";
import { ai, AiError, type BioDraft } from "~/services/ai";
import { useTheme } from "~/theme";
import type { FillingFor } from "~/types/api";

const TONE_LABEL: Record<BioDraft["tone"], string> = {
  simple: "Seedha-saada",
  family: "Ghar-parivaar wala",
  professional: "Professional",
};

/**
 * About Me, three ways — the member always has the last word:
 *   1. write it themselves;
 *   2. tap three sets of chips and let code compose two plain sentences
 *      (the web's `composeAboutMe` — first person for self, third person when
 *      a parent is filling, never a lie in someone else's voice);
 *   3. ask Grio for three drafts built only from whitelisted fields
 *      (`/api/profile/bio` never sees income, caste, gotra or location).
 */
export const AboutField = memo(function AboutField({
  value,
  onChange,
  values,
  fillingFor,
}: {
  value: string;
  onChange: (v: string) => void;
  values: Record<string, string>;
  fillingFor: FillingFor;
}) {
  const t = useTheme();
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [drafts, setDrafts] = useState<BioDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const forSelf = fillingFor === "self";

  const togglePick = (key: string, option: string) => {
    const current = picks[key] ?? [];
    const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option].slice(-3);
    const updated = { ...picks, [key]: next };
    setPicks(updated);
    const composed = composeAboutMe(updated, { name: values.fullName, forSelf });
    if (composed) onChange(composed);
  };

  const askGrio = async () => {
    setLoading(true);
    try {
      const answers = Object.entries(picks).flatMap(([key, list]) => {
        const card = COMPOSE_CARDS.find((c) => c.key === key);
        return card && list.length ? [{ prompt: card.ask, answer: list.join(", ") }] : [];
      });
      setDrafts(await ai.writeBio({ known: values, answers, fillingFor }));
    } catch (err) {
      toast.error(err instanceof AiError ? err.message : "Bio abhi nahi ban paaya — aap khud likh sakte hain.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Input
        value={value}
        onChangeText={onChange}
        placeholder={forSelf ? "Main… (apne baare me 3-4 lines)" : "Wo… (unke baare me 3-4 lines)"}
        multiline
        multilineHeight={130}
        maxLength={600}
        hint={`${value.length}/600`}
      />

      {COMPOSE_CARDS.map((card) => (
        <View key={card.key} style={styles.group}>
          <Text variant="smallStrong" tone="secondary">
            {card.ask}
          </Text>
          <View style={styles.row}>
            {card.options.map((o) => (
              <Chip key={o} label={o} size="sm" selected={(picks[card.key] ?? []).includes(o)} onPress={() => togglePick(card.key, o)} />
            ))}
          </View>
        </View>
      ))}

      <SecondaryButton label={loading ? "Grio likh raha hai…" : "Write with Grio (AI)"} icon={Sparkles} onPress={askGrio} loading={loading} size="md" />

      {drafts ? (
        <View style={styles.drafts}>
          <Text variant="label" tone="gold">
            Grio ke 3 drafts — ek chuniye, phir badal bhi sakte hain
          </Text>
          {drafts.map((d) => (
            <GlassCard key={d.tone} level="soft" padding={14} onPress={() => onChange(d.text)} active={value === d.text}>
              <Text variant="caption" tone="gold">
                {TONE_LABEL[d.tone]}
              </Text>
              <Text variant="body" style={{ marginTop: 4 }}>
                {d.text}
              </Text>
            </GlassCard>
          ))}
        </View>
      ) : null}
      {loading ? <ActivityIndicator color={t.colors.gold} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  group: { gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  drafts: { gap: 10 },
});
