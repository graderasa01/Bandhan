import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const avatar = cva("relative grid shrink-0 place-items-center rounded-full overflow-hidden font-bold text-gold-700 bg-gold-100 dark:bg-gold-900/40 dark:text-gold-200", {
  variants: {
    size: {
      sm: "size-9 text-sm",
      md: "size-12 text-lg",
      lg: "size-16 text-2xl",
    },
  },
  defaultVariants: { size: "md" },
});

export interface AvatarProps extends VariantProps<typeof avatar> {
  name: string;
  photoUrl?: string | null;
  className?: string;
}

/** Initials-circle fallback, photo when available — the recipe MatchCard used inline before this was extracted. */
export default function Avatar({ name, photoUrl, size, className }: AvatarProps) {
  return (
    <span className={cn(avatar({ size }), className)}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote/consent-gated URLs, not build-known
        <img src={photoUrl} alt="" className="size-full object-cover" />
      ) : (
        (name[0] ?? "?").toUpperCase()
      )}
    </span>
  );
}
