import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useGrio } from "~/features/grio/GrioProvider";
import { useTheme } from "~/theme";

/**
 * The old address of Grio's chat. Grio now lives in one room (`/grio`) driven
 * by one turn engine, so this only forwards — with its `?prompt=` asked on
 * arrival, exactly as if typed — and keeps every older link working.
 */
export default function GrioChatForward() {
  const t = useTheme();
  const engine = useGrio();
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const forwarded = useRef(false);

  useEffect(() => {
    if (forwarded.current) return;
    forwarded.current = true;
    engine.open({ kind: "general" }, prompt ? { ask: prompt } : undefined);
    router.replace("/grio");
  }, [engine, prompt]);

  return <View style={{ flex: 1, backgroundColor: t.colors.background }} />;
}
