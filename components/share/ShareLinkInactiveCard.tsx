import Link from "next/link";
import { Clock, Lock } from "lucide-react";
import BrandMark from "@/components/layout/BrandMark";

const COPY = {
  expired: {
    icon: Clock,
    description: "Ye link 30 din baad apne aap band ho jaata hai — safety ke liye, taaki koi purana link hamesha ke liye khula na rahe.",
  },
  revoked: {
    icon: Lock,
    description: "Isse banane wale ne ye link band kar diya hai.",
  },
} as const;

/**
 * A dead link stays calm, not alarming — same instinct as the app's "Abhi
 * Nahi" instead of "Reject": this is a normal, expected state (links expire
 * on purpose), not a broken page. No 404, no red.
 */
export default function ShareLinkInactiveCard({ reason }: { reason: "expired" | "revoked" }) {
  const { icon: Icon, description } = COPY[reason];

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <div className="mb-5 flex justify-center">
          <BrandMark />
        </div>
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-bg-subtle text-muted">
          <Icon className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-ink">Ye link ab active nahi hai</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{description}</p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-5 text-sm font-medium text-ink shadow-xs transition-colors hover:border-gold-500 hover:bg-gold-50"
        >
          BandhanTak par jaayein
        </Link>
      </div>
    </div>
  );
}
