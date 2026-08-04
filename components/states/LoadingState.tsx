"use client";

type SkeletonVariant = "card" | "table" | "profile" | "text";

interface LoadingStateProps {
  variant?: SkeletonVariant;
  text?: string;
  itemCount?: number;
}

function SkeletonBlock({ width, height }: { width?: string; height: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: width || "100%",
        height,
        backgroundColor: "var(--color-bg-soft)",
        borderRadius: "var(--radius-sm)",
        animation: "skeleton-pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

function CardSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)", backgroundColor: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
      <SkeletonBlock height="20px" width="40%" />
      <SkeletonBlock height="14px" width="100%" />
      <SkeletonBlock height="14px" width="80%" />
      <SkeletonBlock height="14px" width="60%" />
      <SkeletonBlock height="40px" width="100%" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", padding: "var(--space-4)", backgroundColor: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-2)" }}>
        <SkeletonBlock height="24px" />
        <SkeletonBlock height="24px" />
        <SkeletonBlock height="24px" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "var(--space-4)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border)" }}>
          <SkeletonBlock height="16px" />
          <SkeletonBlock height="16px" />
          <SkeletonBlock height="16px" width="50%" />
        </div>
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div style={{ display: "flex", gap: "var(--space-4)", padding: "var(--space-4)", backgroundColor: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
      <SkeletonBlock height="80px" width="80px" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <SkeletonBlock height="20px" width="60%" />
        <SkeletonBlock height="14px" width="90%" />
        <SkeletonBlock height="14px" width="70%" />
      </div>
    </div>
  );
}

function TextSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)" }}>
      <SkeletonBlock height="24px" width="30%" />
      <SkeletonBlock height="14px" width="100%" />
      <SkeletonBlock height="14px" width="100%" />
      <SkeletonBlock height="14px" width="80%" />
      <SkeletonBlock height="14px" width="100%" />
      <SkeletonBlock height="14px" width="40%" />
    </div>
  );
}

export default function LoadingState({
  variant = "card",
  text = "Loading...",
  itemCount = 3,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={text}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
    >
      {Array.from({ length: itemCount }).map((_, i) => {
        if (variant === "table") return <TableSkeleton key={i} />;
        if (variant === "profile") return <ProfileSkeleton key={i} />;
        if (variant === "text") return <TextSkeleton key={i} />;
        return <CardSkeleton key={i} />;
      })}
      {text && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", textAlign: "center" }}>
          {text}
        </p>
      )}
      <style jsx>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}