import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getAllAiRoutes } from "@/lib/ai/aiConfigService";
import { AI_FEATURE_LABELS } from "@/lib/ai/models";
import AdminShell from "@/components/layout/AdminShell";
import AiSettingsManager from "@/components/admin/AiSettingsManager";

export default async function AdminAiSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/ai-settings");
  if (user.role !== "ADMIN") redirect("/");

  const routes = await getAllAiRoutes();

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">AI Settings</h1>
          <p className="mt-2 text-sm text-muted">
            Har AI feature ke liye provider aur model yahan se badlein — turant live ho jata hai, redeploy ki zaroorat
            nahi.
          </p>
        </section>

        <AiSettingsManager
          rows={routes.map((r) => ({
            feature: r.feature,
            label: AI_FEATURE_LABELS[r.feature],
            provider: r.route.provider,
            model: r.route.model,
            isDefault: r.isDefault,
          }))}
        />
      </div>
    </AdminShell>
  );
}
