import { Users } from "lucide-react";
import EmptyStateScreen from "./_shared/EmptyStateScreen";

/** Someone reached `/family` with no (or an expired) family session — most likely a bookmarked link after a revoke. */
export default function NotJoinedCard() {
  return (
    <EmptyStateScreen
      icon={Users}
      title="Aap kisi Family Circle se judhe nahi hain"
      description="Isse khulne ke liye aapko jo invite link bheja gaya tha, use dobara kholiye."
    />
  );
}
