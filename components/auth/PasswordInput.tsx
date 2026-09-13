"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Input, { type InputProps } from "@/components/ui/Input";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * A password box with a show/hide eye — one field instead of "password" and
 * "confirm password". On a phone, seeing what you typed catches the typo a
 * second box was there to catch, with half the typing.
 */
const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, "type" | "suffix">>(
  function PasswordInput(props, ref) {
    const t = useT();
    const [visible, setVisible] = useState(false);

    return (
      <Input
        ref={ref}
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        suffix={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:text-ink"
            aria-label={visible ? t("password.hide", "Password chhupayein") : t("password.show", "Password dikhayein")}
            aria-pressed={visible}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        }
      />
    );
  },
);

export default PasswordInput;
