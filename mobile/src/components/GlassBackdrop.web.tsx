import { memo, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { backdropFilter, type Material } from "~/theme";

/**
 * The web preview's pane backdrop: the admin's exact CSS — `backdrop-filter:
 * blur() saturate() brightness() contrast()` — the same recipe the website
 * paints, so a screenshot here is the material as specified. Set on the DOM
 * node directly: the style system does not carry `backdrop-filter` through.
 */
export const GlassBackdrop = memo(function GlassBackdrop({ material, blur }: { material: Material; blur: number }) {
  const ref = useRef<View>(null);
  const filter = material.kind === "glass" ? backdropFilter(material, blur) : "";

  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.style) return;
    node.style.setProperty("backdrop-filter", filter || "none");
    node.style.setProperty("-webkit-backdrop-filter", filter || "none");
  }, [filter]);

  if (!filter) return null;
  return <View ref={ref} style={StyleSheet.absoluteFill} pointerEvents="none" />;
});

export const LIVE_BLUR = true;
