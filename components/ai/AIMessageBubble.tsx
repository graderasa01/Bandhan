interface AIMessageBubbleProps {
  role: "ai" | "user";
  text: string;
  timestamp?: string;
}

export default function AIMessageBubble({ role, text, timestamp }: AIMessageBubbleProps) {
  const isAi = role === "ai";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isAi ? "flex-start" : "flex-end",
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "var(--space-3)",
          borderRadius: "var(--radius-md)",
          fontSize: "var(--text-sm)",
          lineHeight: "var(--leading-normal)",
          backgroundColor: isAi ? "var(--color-info-soft)" : "var(--color-bg-soft)",
          color: "var(--color-text)",
          borderBottomLeftRadius: isAi ? "var(--radius-sm)" : undefined,
          borderBottomRightRadius: isAi ? undefined : "var(--radius-sm)",
        }}
      >
        <p style={{ margin: 0 }}>{text}</p>
        {timestamp && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", marginTop: "var(--space-1)", marginBottom: 0 }}>
            {timestamp}
          </p>
        )}
      </div>
    </div>
  );
}