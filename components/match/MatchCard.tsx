import Link from "next/link";
import { MessageCircle, Sparkles, User } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { getT } from "@/lib/i18n/server";

interface Props {
  name: string;
  age: number;
  city: string;
  education: string;
  profession: string;
  trustScore: number;
  verified: boolean;
  compatibility?: number | null;
  matchReason?: string;
  /** The Match row's own id — present once this card comes from real matches data. */
  matchId?: string;
  /** The other person's profile id — opens the full L3 profile. */
  profileId?: string;
  /**
   * Safe to render unconditionally: this card only exists when a Match does,
   * and a Match is exactly what the photo consent gate waits for.
   */
  photoUrl?: string | null;
  onSendInterest?: () => void;
  onViewProfile?: () => void;
}

export default async function MatchCard({
  name,
  age,
  city,
  education,
  profession,
  trustScore,
  verified,
  compatibility,
  matchReason,
  matchId,
  profileId,
  photoUrl,
  onSendInterest,
  onViewProfile,
}: Props) {
  const t = await getT();
  return (
    <Card padding="lg" className="flex flex-col">
      <div className="mb-3 flex items-start gap-3">
        <Avatar name={name} photoUrl={photoUrl} size="md" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-ink">
              {name}, {age}
            </h4>
            {verified && <Badge variant="verified">{t("match.card.verified", "Verified")}</Badge>}
          </div>
          <p className="text-sm text-muted">{city}</p>
        </div>
        <Badge variant="complete" className="ml-auto">
          {trustScore}
        </Badge>
      </div>

      <p className="mb-4 text-sm text-muted">
        {education} · {profession}
      </p>

      {(compatibility != null || matchReason) && (
        <div className="mb-3 flex items-start gap-1.5 rounded-lg border border-gold-300/60 bg-gold-50 p-2.5 text-xs text-gold-800 dark:border-gold-400/25 dark:bg-gold-900/30 dark:text-gold-200">
          <Sparkles className="mt-px size-3.5 shrink-0" />
          <span>
            {compatibility != null && (
              <strong className="font-semibold">
                {compatibility}
                {t("match.card.percentMatch", "% match. ")}
              </strong>
            )}
            {matchReason}
          </span>
        </div>
      )}

      <div className="mt-auto flex gap-2">
        {matchId && (
          <Link href={`/user/messages/${matchId}`} className="flex-1">
            <Button size="sm" icon={<MessageCircle className="size-4" />} fullWidth>
              {t("match.card.message", "Message")}
            </Button>
          </Link>
        )}
        {onSendInterest && (
          <Button size="sm" onClick={onSendInterest} className="flex-1">
            {t("match.card.sendInterest", "Send Interest")}
          </Button>
        )}
        {profileId ? (
          <Link href={`/user/profile/${profileId}`} className="flex-1">
            <Button size="sm" variant="secondary" icon={<User className="size-4" />} fullWidth>
              {t("match.card.fullProfile", "Full Profile")}
            </Button>
          </Link>
        ) : (
          onViewProfile && (
            <Button size="sm" variant="ghost" onClick={onViewProfile} className="flex-1">
              {t("match.card.viewProfile", "View Profile")}
            </Button>
          )
        )}
      </div>
    </Card>
  );
}
