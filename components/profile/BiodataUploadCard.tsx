"use client";
import { useCallback, useRef, useState } from "react";
import Progress from "@/components/ui/Progress";

interface Props {
  onPasteText?: (text: string) => void;
  onFileSelected?: (file: File) => void;
}

const ACCEPTED_TYPES = ["image/", "application/pdf", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_FILE_SIZE_MB = 10;

function isAcceptedFile(file: File) {
  return ACCEPTED_TYPES.some((type) => file.type.startsWith(type));
}

function fileIcon(file: File) {
  if (file.type.startsWith("image/")) return "🖼️";
  if (file.type === "application/pdf") return "📕";
  return "📝";
}

export default function BiodataUploadCard({ onPasteText, onFileSelected }: Props) {
  const [pasteText, setPasteText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const runFakeProgress = useCallback((onDone: () => void) => {
    setProcessing(true);
    setProgress(0);
    let p = 0;
    const int = setInterval(() => {
      p += 20;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(int);
        setProcessing(false);
        onDone();
      }
    }, 300);
  }, []);

  const validateAndSetFile = useCallback(
    (file: File) => {
      setError(null);
      if (!isAcceptedFile(file)) {
        setError("Yeh file type support nahi hai. Image, PDF, ya document try karein.");
        return;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`File size ${MAX_FILE_SIZE_MB}MB se zyada hai.`);
        return;
      }
      setSelectedFile(file);
      runFakeProgress(() => onFileSelected?.(file));
    },
    [onFileSelected, runFakeProgress]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const handlePaste = () => {
    if (!pasteText.trim()) return;
    runFakeProgress(() => onPasteText?.(pasteText));
  };

  const clearFile = () => {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-6)",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "var(--space-6)" }}>
        <span style={{ fontSize: "40px", display: "block", marginBottom: "var(--space-3)" }} aria-hidden="true">
          📄
        </span>
        <h3
          style={{
            fontSize: "var(--text-lg)",
            fontWeight: "var(--font-semibold)",
            color: "var(--color-text)",
            margin: "0 0 var(--space-1) 0",
          }}
        >
          Biodata se profile auto-fill karein
        </h3>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", margin: 0 }}>
          AI details draft karega. Save se pehle aap review kar sakte hain.
        </p>
      </div>

      {!processing ? (
        <>
          {!selectedFile ? (
            <div
              onDrop={handleDrop}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={(e) => e.preventDefault()}
              style={{
                border: `2px dashed ${isDragging ? "var(--color-primary)" : "var(--color-border)"}`,
                borderRadius: "var(--radius-md)",
                padding: "var(--space-8)",
                textAlign: "center",
                marginBottom: "var(--space-4)",
                backgroundColor: isDragging ? "var(--color-primary-soft)" : "var(--color-surface-soft)",
                transition: "border-color var(--transition-fast), background-color var(--transition-fast)",
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*,.pdf,.txt,.doc,.docx"
                onChange={handleFileChange}
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
                id="biodata-upload"
              />
              <label htmlFor="biodata-upload" style={{ cursor: "pointer", display: "block" }}>
                <p
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: "var(--font-medium)",
                    color: "var(--color-text)",
                    margin: "0 0 var(--space-1) 0",
                  }}
                >
                  📁 {isDragging ? "Yahan drop karein" : "Biodata file yaha drag karein ya click karein"}
                </p>
                <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", margin: 0 }}>
                  Supported: Image, PDF, Text, Document, Screenshot (max {MAX_FILE_SIZE_MB}MB)
                </p>
              </label>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3) var(--space-4)",
                marginBottom: "var(--space-4)",
                backgroundColor: "var(--color-surface-soft)",
              }}
            >
              <span style={{ fontSize: "24px" }} aria-hidden="true">
                {fileIcon(selectedFile)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: "var(--font-medium)",
                    color: "var(--color-text)",
                    margin: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {selectedFile.name}
                </p>
                <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", margin: 0 }}>
                  {(selectedFile.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <button
                onClick={clearFile}
                aria-label="File hataayein"
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  fontSize: "var(--text-lg)",
                  lineHeight: 1,
                  padding: "var(--space-1)",
                }}
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <p
              role="alert"
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--color-danger)",
                marginBottom: "var(--space-4)",
              }}
            >
              ⚠ {error}
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
            <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border)" }} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>ya</span>
            <div style={{ flex: 1, height: "1px", backgroundColor: "var(--color-border)" }} />
          </div>

          <div style={{ marginBottom: "var(--space-3)" }}>
            <label htmlFor="biodata-paste" style={{ display: "none" }}>
              Biodata text
            </label>
            <textarea
              id="biodata-paste"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Biodata text yaha paste karein..."
              rows={4}
              style={{
                width: "100%",
                padding: "var(--space-3)",
                fontSize: "var(--text-sm)",
                fontFamily: "var(--font-sans)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                resize: "vertical",
                outline: "none",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-focus)";
                e.currentTarget.style.boxShadow = "0 0 0 2px var(--color-primary-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <button
            onClick={handlePaste}
            disabled={!pasteText.trim()}
            style={{
              width: "100%",
              padding: "var(--space-3)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--font-medium)",
              backgroundColor: pasteText.trim() ? "var(--color-primary)" : "var(--color-bg-soft)",
              color: pasteText.trim() ? "var(--color-text-inverse)" : "var(--color-text-muted)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: pasteText.trim() ? "pointer" : "not-allowed",
              fontFamily: "var(--font-sans)",
              minHeight: "var(--touch-min)",
            }}
          >
            Paste & Process
          </button>
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "var(--space-8) 0" }}>
          <p
            style={{
              fontSize: "var(--text-base)",
              fontWeight: "var(--font-medium)",
              color: "var(--color-text)",
              marginBottom: "var(--space-4)",
            }}
          >
            AI biodata read kar raha hai...
          </p>
          <Progress value={progress} label="Processing..." variant="default" showPercentage />
        </div>
      )}
    </div>
  );
}
