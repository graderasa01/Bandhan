"use client";

import { useT } from "@/components/i18n/LanguageProvider";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onGoBack?: () => void;
}

export default function ErrorState({
  title,
  message,
  onRetry,
  onGoBack,
}: ErrorStateProps) {
  const t = useT();
  const resolvedTitle = title ?? t("states.errorState.title", "Kuch issue aa gaya");
  const resolvedMessage = message ?? t("states.errorState.message", "Please dobara try karein.");
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-16) var(--space-4)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "var(--radius-full)",
          backgroundColor: "var(--color-danger-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "var(--space-4)",
        }}
      >
        <svg width="32" height="32" fill="none" stroke="var(--color-danger)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M12 9v2m0 4h.01M10.29 3.86l-7.77 13.46c-.79 1.37.19 3.08 1.73 3.08h15.5c1.54 0 2.52-1.71 1.73-3.08L13.71 3.86c-.78-1.35-2.64-1.35-3.42 0z" />
        </svg>
      </div>
      <h3 style={{
        fontSize: "var(--text-lg)",
        fontWeight: "var(--font-semibold)",
        color: "var(--color-danger)",
        marginBottom: "var(--space-2)",
      }}>
        {resolvedTitle}
      </h3>
      <p style={{
        fontSize: "var(--text-sm)",
        color: "var(--color-text-muted)",
        maxWidth: "360px",
        marginBottom: "var(--space-6)",
        lineHeight: "var(--leading-normal)",
      }}>
        {resolvedMessage}
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", justifyContent: "center" }}>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              padding: "var(--space-2) var(--space-5)",
              backgroundColor: "var(--color-primary)",
              color: "var(--color-text-inverse)",
              fontWeight: "var(--font-medium)",
              fontSize: "var(--text-sm)",
              borderRadius: "var(--radius-md)",
              border: "none",
              cursor: "pointer",
              minHeight: "var(--touch-min)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {t("states.errorState.retry", "Try Again")}
          </button>
        )}
        {onGoBack && (
          <button
            onClick={onGoBack}
            style={{
              padding: "var(--space-2) var(--space-5)",
              backgroundColor: "transparent",
              color: "var(--color-text)",
              fontWeight: "var(--font-medium)",
              fontSize: "var(--text-sm)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
              minHeight: "var(--touch-min)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {t("states.errorState.goBack", "Go Back")}
          </button>
        )}
      </div>
    </div>
  );
}