import type { Metadata } from "next";
import DesignSystemShowcase from "@/components/design/DesignSystemShowcase";

export const metadata: Metadata = {
  title: "Design System",
  robots: { index: false, follow: false },
};

/**
 * Internal design-system reference. Not linked from the app and not indexed —
 * it exists so component behaviour can be reviewed in one place instead of
 * being discovered page by page.
 */
export default function DesignPage() {
  return <DesignSystemShowcase />;
}
