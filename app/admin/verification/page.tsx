import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPhotoReviewQueue } from "@/lib/services/verification/photoReviewService";
import { getVerificationSettings } from "@/lib/services/verification/verificationSettingsService";
import AdminShell from "@/components/layout/AdminShell";
import PhotoReviewQueue from "@/components/admin/PhotoReviewQueue";
import PhotoVerificationToggle from "@/components/admin/PhotoVerificationToggle";

export default async function AdminVerificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login?next=/admin/verification");
  if (user.role !== "ADMIN") redirect("/");

  const [{ pending, decided }, settings] = await Promise.all([getPhotoReviewQueue(), getVerificationSettings()]);

  return (
    <AdminShell adminName={user.fullName}>
      <div className="mx-auto max-w-4xl">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Photo Verification</h1>
          <p className="mt-2 text-sm text-muted">
            {pending.length > 0
              ? `${pending.length} photo review ke liye pending hain. Approve karte hi user ka trust score badhta hai aur uski profile par verified badge dikhne lagta hai.`
              : "Sab photos review ho chuki hain."}
          </p>
        </section>

        <PhotoVerificationToggle required={settings.photoVerificationRequired} />

        <PhotoReviewQueue pending={pending} decided={decided} />
      </div>
    </AdminShell>
  );
}
