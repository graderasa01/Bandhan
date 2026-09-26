import type { LucideIcon } from "lucide-react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { forwardRef, memo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { fonts, radius, useTheme } from "~/theme";
import { Icon } from "./Icon";
import { Text } from "./Text";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: LucideIcon;
  /** Text shown fixed before the value — "+91". */
  prefix?: string;
  multilineHeight?: number;
}

/** A labelled text field with hint/error lines — the only text input screens use. */
export const Input = memo(
  forwardRef<TextInput, InputProps>(function Input(
    { label, hint, error, icon, prefix, secureTextEntry, multiline, multilineHeight = 120, ...rest },
    ref,
  ) {
    const t = useTheme();
    const [focused, setFocused] = useState(false);
    const [hidden, setHidden] = useState(true);
    const borderColor = error ? t.colors.danger : focused ? (t.dark ? t.colors.gold : t.colors.heading) : t.colors.rim;

    return (
      <View style={styles.wrap}>
        {label ? (
          <Text variant="smallStrong" tone="secondary" style={styles.label}>
            {label}
          </Text>
        ) : null}
        <View
          style={[
            styles.field,
            {
              backgroundColor: t.colors.input,
              borderColor,
              borderWidth: focused || error ? 1.5 : 1,
              minHeight: multiline ? multilineHeight : 52,
              alignItems: multiline ? "flex-start" : "center",
            },
          ]}
        >
          {icon ? (
            <View style={[styles.icon, multiline && { paddingTop: 14 }]}>
              <Icon icon={icon} size={19} tone="muted" />
            </View>
          ) : null}
          {prefix ? (
            <Text variant="bodyStrong" tone="secondary" style={styles.prefix}>
              {prefix}
            </Text>
          ) : null}
          <TextInput
            ref={ref}
            {...rest}
            multiline={multiline}
            secureTextEntry={secureTextEntry ? hidden : false}
            placeholderTextColor={t.colors.textMuted}
            selectionColor={t.dark ? t.colors.gold : t.colors.heading}
            onFocus={(e) => {
              setFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              rest.onBlur?.(e);
            }}
            style={[
              styles.input,
              { color: t.colors.text, fontFamily: fonts.regular },
              multiline && { minHeight: multilineHeight - 4, textAlignVertical: "top", paddingTop: 14 },
            ]}
            maxFontSizeMultiplier={1.3}
            accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
          />
          {secureTextEntry ? (
            <Pressable
              onPress={() => setHidden((h) => !h)}
              accessibilityRole="button"
              accessibilityLabel={hidden ? "Show password" : "Hide password"}
              hitSlop={10}
              style={styles.icon}
            >
              <Icon icon={hidden ? Eye : EyeOff} size={19} tone="muted" />
            </Pressable>
          ) : null}
        </View>
        {error ? (
          <Text variant="small" tone="danger" style={styles.below}>
            {error}
          </Text>
        ) : hint ? (
          <Text variant="small" tone="muted" style={styles.below}>
            {hint}
          </Text>
        ) : null}
      </View>
    );
  }),
);

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { marginLeft: 2 },
  field: { flexDirection: "row", borderRadius: radius.md, paddingHorizontal: 4 },
  icon: { paddingHorizontal: 10, justifyContent: "center" },
  prefix: { paddingLeft: 12, paddingRight: 2 },
  // No outline: the field's own border already turns gold on focus (the web
  // preview otherwise draws the browser's focus ring inside it as well).
  input: { flex: 1, fontSize: 16, paddingHorizontal: 10, paddingVertical: 12, outlineWidth: 0 },
  below: { marginLeft: 2 },
});
