import { Clock, Lock } from "lucide-react";
import EmptyStateScreen from "./_shared/EmptyStateScreen";
import { getT } from "@/lib/i18n/server";

/** Same calm-not-alarming instinct as ShareLinkInactiveCard — an expired invite is a normal state, not a broken page. */
export default async function InviteInactiveCard({ reason }: { reason: "expired" | "revoked" }) {
  const t = await getT();
  const COPY = {
    expired: {
      icon: Clock,
      description: t(
        "family.inviteInactive.expiredDescription",
        "Ye invite 48 ghante ke liye hoti hai. Jisne bheja hai unse ek naya link maang lijiye.",
      ),
    },
    revoked: {
      icon: Lock,
      description: t("family.inviteInactive.revokedDescription", "Isse banane wale ne ye invite band kar diya hai."),
    },
  } as const;
  const { icon, description } = COPY[reason];
  return (
    <EmptyStateScreen
      icon={icon}
      title={t("family.inviteInactive.title", "Ye invite ab active nahi hai")}
      description={description}
    />
  );
}
