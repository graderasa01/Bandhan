import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SEGMENTS } from "@/lib/services/adminMessage/segments";
import { listAdminMessages } from "@/lib/services/adminMessage/adminMessageService";
import { PLAN_FEATURE_KEYS, PLAN_FEATURE_LABELS, PLAN_FEATURE_TYPES } from "@/lib/constants/plans";
import AdminShell from "@/components/layout/AdminShell";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import AdminMessageComposer from "@/components/admin/AdminMessageComposer";

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams?: Promise<{ userId?: string; name?: string; audience?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/messages");
  if (user.role !== "ADMIN") redirect("/");

  const sp = searchParams ? await searchParams : {};
  const history = await listAdminMessages(25);

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-3xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Messages &amp; Offers</h1>
          <p className="mt-2 text-sm text-muted">
            Kisi ek user ko, ek segment ko, ya sabko kuch bhi keh sakte hain — aur chaahein to saath me koi feature
            bhi khol sakte hain. App par ye message unke dashboard ke sabse pehle card par dikhega.
          </p>
        </section>

        <AdminMessageComposer
          segments={SEGMENTS.map((s) => ({ key: s.key, audience: s.audience, label: s.label, blurb: s.blurb }))}
          capabilities={PLAN_FEATURE_KEYS.map((k) => ({
            key: k,
            label: PLAN_FEATURE_LABELS[k],
            type: PLAN_FEATURE_TYPES[k],
          }))}
          presetUserId={sp.userId ?? null}
          presetName={sp.name ?? null}
          presetAudience={sp.audience === "PARTNER" ? "PARTNER" : "USER"}
        />

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">Pehle kya bheja gaya</h2>
          {history.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <p className="text-sm text-muted">Abhi tak koi message nahi bheja gaya.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((m) => (
                <Card key={m.id} variant="soft" padding="md">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink">{m.title}</p>
                        {m.hasOffer && (
                          <Pill tone="gold" size="sm">
                            Offer
                          </Pill>
                        )}
                        <Pill tone={m.failedCount > 0 ? "gold" : "trust"} size="sm">
                          {m.status}
                        </Pill>
                      </div>
                      <p className="mt-1 text-[0.8125rem] text-muted">
                        {m.audience} · {m.target}
                        {m.segmentKey ? `:${m.segmentKey}` : ""} · {m.channels.join("+")}
                      </p>
                    </div>
                    <p className="text-[0.8125rem] text-muted">
                      {m.sentCount}/{m.recipientCount} gaye
                      {m.failedCount > 0 ? ` · ${m.failedCount} fail` : ""}
                      <span className="block text-right text-xs text-subtle">
                        {(m.sentAt ?? m.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
