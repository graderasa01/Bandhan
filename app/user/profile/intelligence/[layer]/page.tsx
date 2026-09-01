import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { catalogKey } from "@/lib/i18n/catalogKeys";
import { getCurrentUser } from "@/lib/auth/session";
import { layerFromSlug, LAYER_BY_KEY } from "@/lib/profile/intelligenceQuestions";
import { buildLayerView, getIntelligenceState } from "@/lib/services/profile/intelligenceService";
import UserShell from "@/components/layout/UserShell";
import IntelligenceLayerFlow from "@/components/profile/IntelligenceLayerFlow";
import Card from "@/components/ui/Card";
import { CheckCircle2 } from "lucide-react";

// The root layout appends "· BandhanTak". A function rather than a constant
// because the tab title is copy like any other and has to follow the locale.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("profile.intelligence.pageTitle", "Bandhan ko aur batayein") };
}

/**
 * One Marriage Intelligence layer, asked one question at a time.
 *
 * Deliberately its own route rather than a modal on the dashboard: the answers
 * take a minute, the user may leave halfway, and a URL they can come back to
 * (or a family member can be sent) is worth more than the animation a modal
 * would buy. Branch conditions are resolved server-side (see
 * `IntelligenceLayerProgress.applicableKeys`) so the browser never needs the
 * profile draft just to decide which questions apply.
 */
export default async function IntelligenceLayerPage({
  params,
}: {
  params: Promise<{ layer: string }>;
}) {
  const { layer: slug } = await params;
  const layerKey = layerFromSlug(slug);
  if (!layerKey) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/user/profile/intelligence/${slug}`);

  const t = await getT();
  const state = await getIntelligenceState(user.id);
  const view = buildLayerView(state, layerKey);
  const known = view.alreadyKnown;

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-xl">
        {known.length > 0 && (
          <Card variant="default" padding="md" className="mb-4">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle">
              {t("profile.intelligence.alreadyKnown", "Ye pehle se pata hai")}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {known.map((k) => (
                <li
                  key={k.field}
                  className="inline-flex items-center gap-1.5 rounded-full border border-trust/30 bg-trust/5 px-3 py-1 text-[0.8125rem] text-ink"
                >
                  <CheckCircle2 className="size-3.5 text-trust" aria-hidden />
                  {t(catalogKey.knownLabel(k.field), k.label)}:{" "}
                  <span className="text-muted">{k.value}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.75rem] text-muted">
              {t(
                "profile.intelligence.alreadyKnownNote",
                "Inhe dobara nahi poochha jayega — {layer} ke baaki sawaal neeche hain.",
              ).replace(
                "{layer}",
                t(catalogKey.layerTitle(layerKey), LAYER_BY_KEY[layerKey].title),
              )}
            </p>
          </Card>
        )}

        <IntelligenceLayerFlow layer={view} />
      </div>
    </UserShell>
  );
}
