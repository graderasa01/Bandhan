import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { Container } from "@/components/ui/Container";
import BrandMark from "@/components/layout/BrandMark";

const FOOTER_GROUPS = [
  {
    titleKey: "footer.group.product",
    title: "Product",
    links: [
      { href: "/how-it-works", key: "footer.link.howItWorks", label: "How It Works" },
      { href: "/pricing", key: "footer.link.pricing", label: "Pricing" },
      { href: "/register", key: "footer.link.createProfile", label: "Profile Banayein" },
      { href: "/login", key: "footer.link.login", label: "Login" },
    ],
  },
  {
    titleKey: "footer.group.partner",
    title: "Partner",
    links: [
      { href: "/partner-program", key: "footer.link.partnerProgram", label: "Partner Program" },
      { href: "/partner/register", key: "footer.link.partnerRegistration", label: "Partner Registration" },
      { href: "/partner/pending", key: "footer.link.applicationStatus", label: "Application Status" },
    ],
  },
  {
    titleKey: "footer.group.trust",
    title: "Trust",
    links: [
      { href: "/safety", key: "footer.link.safety", label: "Safety & Privacy" },
      { href: "#", key: "footer.link.privacyPolicy", label: "Privacy Policy" },
      { href: "#", key: "footer.link.terms", label: "Terms of Use" },
      { href: "#", key: "footer.link.contact", label: "Contact" },
    ],
  },
];

export default async function PublicFooter() {
  const t = await getT();
  return (
    <footer className="on-deep grain relative border-t border-wine-800 bg-wine-800 dark:bg-wine-900">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/50 to-transparent"
      />

      <Container size="wide">
        <div className="relative grid gap-12 py-16 lg:grid-cols-[1.4fr_2fr] lg:gap-16">
          <div className="max-w-sm">
            <BrandMark onDeep />
            <p className="mt-5 text-[0.9375rem] leading-relaxed text-white/60">
              {t(
                "footer.blurb",
                "AI powered verified matrimony aur partner income network. Verified profiles, privacy-first connections, transparent commissions.",
              )}
            </p>
          </div>

          <nav className="grid gap-8 sm:grid-cols-3" aria-label="Footer">
            {FOOTER_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-gold-300/80">
                  {t(group.titleKey, group.title)}
                </p>
                <ul className="mt-2">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="flex min-h-12 items-center text-sm text-white/60 transition-colors hover:text-white"
                      >
                        {t(link.key, link.label)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-6 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-white/45">
            © {new Date().getFullYear()} BandhanTak. All rights reserved.
          </p>
          <p className="text-xs text-white/45">
            {t("footer.tagline", "Made in India · Marriage guarantee jaisa koi claim nahi")}
          </p>
        </div>
      </Container>
    </footer>
  );
}
