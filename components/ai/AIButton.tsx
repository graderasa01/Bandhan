"use client";

interface AIButtonProps {
  onClick: () => void;
  hasSuggestion?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

export default function AIButton({
  onClick,
  hasSuggestion = false,
  disabled = false,
  ariaLabel = "AI Help",
}: AIButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        width: "56px",
        height: "56px",
        borderRadius: "var(--radius-full)",
        backgroundColor: disabled ? "var(--color-text-muted)" : "var(--color-primary)",
        color: "var(--color-text-inverse)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "var(--shadow-lg)",
        zIndex: "var(--z-fixed)",
        transition: "transform var(--transition-fast), box-shadow var(--transition-fast)",
        opacity: disabled ? 0.6 : 1,
      }}
      className="ai-button"
    >
      {/* Sparkles icon */}
      <svg
        aria-hidden="true"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
      >
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
        <path d="M12 3v0M18 9v0M12 15v0M6 9v0" />
      </svg>

      {/* Pulse ring when suggestion available */}
      {hasSuggestion && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-4px",
            borderRadius: "var(--radius-full)",
            border: "2px solid var(--color-primary)",
            animation: "ai-pulse 2s ease-in-out infinite",
          }}
        />
      )}

      <style jsx>{`
        .ai-button:not(:disabled):hover {
          transform: scale(1.05);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        }
        @keyframes ai-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.4; }
        }
        @media (max-width: 767px) {
          .ai-button {
            right: 16px !important;
            bottom: 80px !important;
          }
        }
        @media (min-width: 768px) {
          .ai-button {
            right: 24px !important;
            bottom: 24px !important;
          }
        }
      `}</style>
    </button>
  );
}