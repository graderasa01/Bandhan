import { SendHorizontal } from "lucide-react-native";
import { memo, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Icon } from "~/components";
import { fonts, radius, useTheme } from "~/theme";
import { GRIO_MAX_MESSAGE_LENGTH } from "../engine/request";
import { useGrio, useGrioState } from "../GrioProvider";

/**
 * Typing to Grio. What is typed goes through the same turn as a chip or (in
 * Phase 7) the voice loop — there is no second path for text.
 */
export const GrioComposer = memo(function GrioComposer({ placeholder }: { placeholder: string }) {
  const engine = useGrio();
  const t = useTheme();
  const sending = useGrioState((s) => s.sending);
  const [text, setText] = useState("");
  const ready = text.trim().length > 0 && !sending;

  function send() {
    if (!ready) return;
    const question = text;
    setText("");
    void engine.ask(question, { source: "typed" });
  }

  return (
    <View style={styles.row}>
      <View style={[styles.inputWrap, { backgroundColor: t.colors.input, borderColor: t.colors.rim }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={t.colors.textMuted}
          multiline
          maxLength={GRIO_MAX_MESSAGE_LENGTH}
          style={[styles.input, { color: t.colors.text, fontFamily: fonts.regular }]}
          accessibilityLabel="Message to Grio"
          maxFontSizeMultiplier={1.3}
          // A hardware Enter sends on the web preview; on a phone Return is a new line.
          onKeyPress={(e) => {
            const native = e.nativeEvent as { key?: string; shiftKey?: boolean };
            if (Platform.OS === "web" && native.key === "Enter" && !native.shiftKey) {
              (e as unknown as { preventDefault?: () => void }).preventDefault?.();
              send();
            }
          }}
        />
      </View>
      <Pressable
        onPress={send}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: !ready }}
        style={[styles.send, { backgroundColor: ready ? t.colors.accent : t.colors.glassSoft }]}
      >
        <Icon icon={SendHorizontal} size={20} color={ready ? t.colors.accentFg : t.colors.textMuted} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10 },
  inputWrap: { flex: 1, borderRadius: radius.xl, borderWidth: 1, minHeight: 46, maxHeight: 130, justifyContent: "center" },
  input: { fontSize: 16, paddingHorizontal: 15, paddingVertical: Platform.OS === "ios" ? 12 : 9, outlineWidth: 0 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
});
