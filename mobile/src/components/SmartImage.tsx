import { Image, type ImageContentPosition } from "expo-image";
import { memo, useMemo, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { authHeaders, resolveMediaUrl } from "~/services/api/client";
import type { PhotoLock } from "~/types/api";
import { PhotoPlaceholder } from "./PhotoPlaceholder";

export interface SmartImageProps {
  uri: string | null | undefined;
  /** Whose photo — for the placeholder and the accessibility label. */
  name: string;
  lock?: PhotoLock;
  style?: StyleProp<ViewStyle>;
  /** 0..100 vertical focal point from the server (`focalY`). */
  focalY?: number | null;
  placeholderSize?: "sm" | "md" | "lg";
  showLockLine?: boolean;
  /** See `PhotoPlaceholder.insetBottom`. */
  placeholderInsetBottom?: number;
  priority?: "low" | "normal" | "high";
}

/**
 * Every profile photo goes through here:
 *
 *   - relative server paths are made absolute; gated `/api/media/*` bytes get
 *     the session header (never baked into a URL);
 *   - memory + disk cache, a short cross-fade, and `recyclingKey` so a
 *     recycled list cell never flashes the previous person's face;
 *   - an absent, locked or failed photo falls back to the designed
 *     placeholder instead of a broken-image box.
 */
export const SmartImage = memo(function SmartImage({
  uri,
  name,
  lock = "open",
  style,
  focalY,
  placeholderSize = "md",
  showLockLine = true,
  placeholderInsetBottom,
  priority = "normal",
}: SmartImageProps) {
  // Remembers *which* URL failed, so a recycled cell showing someone else is not stuck on the fallback.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const resolved = resolveMediaUrl(uri);
  const failed = failedUri !== null && failedUri === resolved;
  const source = useMemo(() => {
    if (!resolved) return null;
    const gated = resolved.includes("/api/media/");
    return gated ? { uri: resolved, headers: authHeaders() } : { uri: resolved };
  }, [resolved]);

  if (!source || failed || lock !== "open") {
    return (
      <PhotoPlaceholder
        name={name}
        lock={lock}
        style={style}
        size={placeholderSize}
        showLockLine={showLockLine}
        insetBottom={placeholderInsetBottom}
      />
    );
  }

  const position: ImageContentPosition = { top: `${focalY ?? 30}%`, left: "50%" };
  return (
    <View style={[styles.frame, style]}>
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={position}
        transition={180}
        cachePolicy="memory-disk"
        recyclingKey={resolved ?? undefined}
        priority={priority}
        onError={() => setFailedUri(resolved)}
        accessibilityLabel={`${name} ki photo`}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: "#2a0710" },
});
