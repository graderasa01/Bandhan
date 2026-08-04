import Link from "next/link";
import { Users } from "lucide-react";
import BrandMark from "@/components/layout/BrandMark";

/** Someone reached `/family` with no (or an expired) family session — most likely a bookmarked link after a revoke. */
export default function NotJoinedCard() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <div className="mb-5 flex justify-center">
          <BrandMark />
        </div>
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-bg-subtle text-muted">
          <Users className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-ink">Aap kisi Family Circle se judhe nahi hain</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          Isse khulne ke liye aapko jo invite link bheja gaya tha, use dobara kholiye.
        </p>
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
