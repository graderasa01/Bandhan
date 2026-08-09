"use client";

import { useT } from "@/components/i18n/LanguageProvider";

interface MockDataBannerProps {
  position?: "top" | "inline";
  compact?: boolean;
}

export default function MockDataBanner({ position = "top", compact = false }: MockDataBannerProps) {
  const t = useT();
  const show = process.env.NEXT_PUBLIC_SHOW_MOCK_BANNER;
  if (show !== "true") return null;

  const isTop = position === "top";

  return (
    <div
      role="alert"
      aria-label={t("states.mockDataBanner.ariaLabel", "Mock data notice")}
      style={{
        backgroundColor: "var(--color-warning-soft)",
        color: "var(--color-warning)",
        fontSize: compact ? "var(--text-xs)" : "var(--text-sm)",
        fontWeight: "var(--font-medium)",
        padding: compact ? "4px 12px" : "8px 16px",
        borderBottom: isTop ? "1px solid var(--color-warning)" : "none",
        borderRadius: isTop ? "0" : "var(--radius-sm)",
        textAlign: "center",
        position: isTop ? "sticky" : "static",
        top: isTop ? "0" : undefined,
        zIndex: isTop ? "var(--z-sticky)" : undefined,
        width: "100%",
      }}
    >
      {t("states.mockDataBanner.text", "⚠ MOCK DATA — Demo only — Not real user data")}
    </div>
  );
}