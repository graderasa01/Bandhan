"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "bt-theme";

/**
 * Light/dark switch. The initial class is applied by the inline script in
 * app/layout.tsx before paint, so this only has to stay in sync with it.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* storage blocked — theme still applies for this session */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Light mode on karein" : "Dark mode on karein"}
      className={cn(
        // visually 40px, 48px hit area (D-23)
        "touch-target grid size-10 place-items-center rounded-full border border-line bg-surface text-muted",
        "transition-colors hover:border-gold-500 hover:text-primary-text",
        "focus-visible:ring-2 focus-visible:ring-gold-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        className,
      )}
    >
      {mounted && dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
