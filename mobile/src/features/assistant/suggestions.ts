import type { LucideIcon } from "lucide-react-native";
import { Camera, Heart, House, PenLine, Rocket, Sprout } from "lucide-react-native";
import { FIELD_BY_KEY, isAnswered } from "~/catalog";
import type { MyProfile } from "~/types/api";

export interface Suggestion {
  key: string;
  icon: LucideIcon;
  title: string;
  body: string;
  impact: "high" | "medium";
  actionLabel: string;
  route: string;
}

const answered = (me: MyProfile, keys: string[]) =>
  keys.filter((k) => {
    const def = FIELD_BY_KEY[k];
    return def ? isAnswered(def, me.values) : false;
  }).length;

/**
 * "What would make this profile get more answers?" — decided in code from
 * the member's own profile, never guessed by a model: the photo, the minimum
 * to go live, and the sections people look for first (the same vocabulary as
 * the reel's `ReelProfileGap`: family, about, expectations, lifestyle). The
 * AI's part is helping *fill* them (voice, bio drafts), not inventing them.
 */
export function profileSuggestions(me: MyProfile | undefined): Suggestion[] {
  if (!me) return [];
  const out: Suggestion[] = [];

  if (!me.isLive && me.readiness.blockers.length) {
    out.push({
      key: "live",
      icon: Rocket,
      title: "Profile live kijiye",
      body: `Bas ${me.readiness.blockers.map((b) => b.label).join(", ")} — phir rishte aapko dekh payenge.`,
      impact: "high",
      actionLabel: "Complete Now",
      route: "/setup",
    });
  }
  if (me.photos.length === 0) {
    out.push({
      key: "photo",
      icon: Camera,
      title: "Ek saaf photo lagaiye",
      body: "Photo wali profiles ko kahin zyada interests milte hain — aur aapko bhi doosron ki photo dikhne lagti hai.",
      impact: "high",
      actionLabel: "Add Photo",
      route: "/setup/photos",
    });
  }
  const about = (me.values.aboutMe ?? "").trim();
  if (about.length < 80) {
    out.push({
      key: "about",
      icon: PenLine,
      title: about ? "About Me thoda aur likhiye" : "About Me likhiye",
      body: "Log sabse pehle yahi padhte hain. Grio aapke jawabon se 3 drafts bana dega — aap chuniye.",
      impact: "high",
      actionLabel: "Write with Grio",
      route: "/setup/about",
    });
  }
  const partner = ["partnerAgeRange", "partnerCityPreference", "partnerEducation", "partnerWorkExpectation"];
  if (answered(me, partner) < 2) {
    out.push({
      key: "partner",
      icon: Heart,
      title: "Partner ki pasand bataiye",
      body: "Reel aur search inhi se chalte hain — pasand pata ho to rishte bhi behtar aate hain.",
      impact: "medium",
      actionLabel: "Add Preferences",
      route: "/setup/preferences",
    });
  }
  const family = ["familyType", "familyValues", "fatherOccupation", "motherOccupation", "siblings"];
  if (answered(me, family) < 3) {
    out.push({
      key: "family",
      icon: House,
      title: "Parivaar ke baare me bataiye",
      body: "Rishta dekhne wale ghar walon ka ye sabse pehla sawaal hota hai.",
      impact: "medium",
      actionLabel: "Add Family",
      route: "/setup/family",
    });
  }
  const lifestyle = ["diet", "smoking", "drinking", "hobbies"];
  if (answered(me, lifestyle) < 2) {
    out.push({
      key: "lifestyle",
      icon: Sprout,
      title: "Rehen-sehen bataiye",
      body: "Khaan-paan aur shauk — roz ki zindagi me yahi sabse zyada matter karte hain.",
      impact: "medium",
      actionLabel: "Add Lifestyle",
      route: "/setup/lifestyle",
    });
  }
  return out;
}
