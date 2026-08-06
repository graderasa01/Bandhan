"use client";

import Sheet from "@/components/ui/Sheet";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";

/**
 * The reject/suspend "give a reason" sheet — same shape across
 * PartnerReviewList, PhotoReviewQueue and VoiceAccessReviewList:
 * a Textarea, an optional helper line, and Cancel/Confirm buttons.
 */
export default function ReasonSheet({
  open,
  onClose,
  title,
  description,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  helperText,
  confirmLabel,
  confirmDisabled,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
  maxLength: number;
  helperText?: string;
  confirmLabel: string;
  confirmDisabled: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description} variant="center">
      <div className="space-y-3">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          showCount
        />
        {helperText && <p className="text-[0.6875rem] text-subtle">{helperText}</p>}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button variant="danger" size="md" fullWidth disabled={confirmDisabled || busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" size="md" fullWidth onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
