import Link from "next/link";
import { Clock, Lock } from "lucide-react";
import BrandMark from "@/components/layout/BrandMark";

const COPY = {
  expired: {
    icon: Clock,
    description: "Ye invite 48 ghante ke liye hoti hai. Jisne bheja hai unse ek naya link maang lijiye.",
  },
  revoked: {
    icon: Lock,
    description: "Isse banane wale ne ye invite band kar diya hai.",
  },
} as const;

/** Same calm-not-alarming instinct as ShareLinkInactiveCard — an expired invite is a normal state, not a broken page. */
export default function InviteInactiveCard({ reason }: { reason: "expired" | "revoked" }) {
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
        <h1 className="mt-4 text-xl font-bold text-ink">Ye invite ab active nahi hai</h1>
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
