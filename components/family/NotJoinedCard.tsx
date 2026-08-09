import { Users } from "lucide-react";
import EmptyStateScreen from "./_shared/EmptyStateScreen";
import { getT } from "@/lib/i18n/server";

/** Someone reached `/family` with no (or an expired) family session — most likely a bookmarked link after a revoke. */
export default async function NotJoinedCard() {
  const t = await getT();
  return (
    <EmptyStateScreen
      icon={Users}
      title={t("family.notJoined.title", "Aap kisi Family Circle se judhe nahi hain")}
      description={t(
        "family.notJoined.description",
        "Isse khulne ke liye aapko jo invite link bheja gaya tha, use dobara kholiye.",
      )}
    />
  );
}
