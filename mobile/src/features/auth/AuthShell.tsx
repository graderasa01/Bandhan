import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { BrandMark, GlassCard, Screen, ScreenHeader, Text } from "~/components";

/** The frame every sign-in step shares: seal, a clear title, one glass card of fields, the action at the foot. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  back = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  back?: boolean;
}) {
  return (
    <Screen header={<ScreenHeader back={back} />} footer={footer}>
      <View style={styles.head}>
        <BrandMark size={52} />
        <Text variant="h1" center style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" tone="secondary" center>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <GlassCard padding={18}>
        <View style={styles.fields}>{children}</View>
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: 8, marginTop: 8, marginBottom: 22 },
  title: { marginTop: 8 },
  fields: { gap: 16 },
});
