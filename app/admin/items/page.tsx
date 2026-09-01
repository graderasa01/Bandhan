import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import AdminShell from "@/components/layout/AdminShell";
import ServiceItemManager from "@/components/admin/ServiceItemManager";
import { listItemsForAdmin } from "@/lib/services/items/itemAdminService";

/**
 * The à-la-carte catalog, separate from /admin/pricing on purpose.
 *
 * Pricing is about the ladder — what a monthly plan costs and what each rung
 * includes. This page is about the things sold *outside* the ladder, and the
 * two answer different questions ("should Premium be ₹1,499?" versus "is
 * Discovery Week worth ₹149 on its own?"). Folding items into the pricing page
 * would also put a growing list under a heading that is already three sections
 * long.
 */
export default async function AdminItemsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/items");
  if (user.role !== "ADMIN") redirect("/");

  const items = await listItemsForAdmin();

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Items &amp; one-time purchases</h1>
          <p className="mt-2 text-sm text-muted">
            Jo cheezein subscription ke bahar, ek baar me bikti hain. Daam aur wording turant live hote hain — koi
            deploy nahi. Built-in item ka row tabhi banta hai jab aap use pehli baar save karte hain.
          </p>
        </section>

        <ServiceItemManager
          items={items.map((i) => ({
            code: i.code,
            name: i.name,
            description: i.description,
            priceInPaise: i.priceInPaise,
            kind: i.kind,
            config: i.config as unknown as Record<string, unknown>,
            isActive: i.isActive,
            isPublic: i.isPublic,
            displayOrder: i.displayOrder,
            isBuiltin: i.isBuiltin,
            configValid: i.configValid,
            purchaseCount: i.purchaseCount,
          }))}
        />
      </div>
    </AdminShell>
  );
}
