import { Clock, Lock } from "lucide-react";
import EmptyStateScreen from "./_shared/EmptyStateScreen";

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
  const { icon, description } = COPY[reason];
  return <EmptyStateScreen icon={icon} title="Ye invite ab active nahi hai" description={description} />;
}
