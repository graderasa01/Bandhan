import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Image as ImageIcon, Lock, Search } from "lucide-react-native";
import { View } from "react-native";
import { Chip, ErrorState, GlassCard, Icon, ListRow, Screen, ScreenHeader, Skeleton, Text, toast } from "~/components";
import { DISCOVER } from "~/catalog";
import { errorMessage } from "~/services/api/client";
import { settingsService, type ConsentKey, type PhotoPrivacy } from "~/services/settings";

const CONSENT_KEYS: ConsentKey[] = ["religion", "caste", "gotra", "manglik", "income"];

/**
 * Who sees what — the member's own switches, stored on the server:
 * photo privacy (D-90), incognito browsing (plan feature), and which
 * sensitive fields search may match them on (off by default).
 */
export default function Visibility() {
  const qc = useQueryClient();
  const photo = useQuery({ queryKey: ["photo-privacy"], queryFn: settingsService.photoPrivacy });
  const incognito = useQuery({ queryKey: ["incognito"], queryFn: settingsService.incognito });
  const consent = useQuery({ queryKey: ["consent"], queryFn: settingsService.consent });

  const setPhoto = useMutation({
    mutationFn: (v: PhotoPrivacy) => settingsService.setPhotoPrivacy(v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["photo-privacy"] });
      toast.success("Photo privacy update ho gayi");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setIncognito = useMutation({
    mutationFn: (v: boolean) => settingsService.setIncognito(v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["incognito"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setConsent = useMutation({
    mutationFn: (patch: Partial<Record<ConsentKey, boolean>>) => settingsService.setConsent(patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["consent"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const loading = photo.isPending || incognito.isPending || consent.isPending;
  const error = photo.error ?? incognito.error ?? consent.error;

  return (
    <Screen header={<ScreenHeader title="Profile Visibility" />}>
      {loading ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={140} radius={20} />
          <Skeleton height={90} radius={20} />
          <Skeleton height={220} radius={20} />
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void qc.invalidateQueries()} />
      ) : (
        <View style={{ gap: 16 }}>
          <GlassCard padding={16}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon icon={ImageIcon} size={18} tone="gold" />
              <Text variant="h3">Meri photo kaun dekhe?</Text>
            </View>
            <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
              Members: jinki apni photo lagi hai, wo aapki photo dekh sakte hain. Match only: sirf dono ki haan ke baad.
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Chip label="Members" selected={photo.data === "MEMBERS"} onPress={() => setPhoto.mutate("MEMBERS")} block />
              <Chip label="Match only" icon={Lock} selected={photo.data === "MATCH_ONLY"} onPress={() => setPhoto.mutate("MATCH_ONLY")} block />
            </View>
          </GlassCard>

          <GlassCard padding={4}>
            <View style={{ paddingHorizontal: 12 }}>
              <ListRow
                icon={EyeOff}
                title="Incognito browsing"
                subtitle={incognito.data?.allowed ? "Profiles dekhne par 'kisne dekha' me aapka naam nahi aayega" : "Rishta Pass me milta hai"}
                toggle={{ value: Boolean(incognito.data?.enabled), onChange: (v) => setIncognito.mutate(v), disabled: !incognito.data?.allowed }}
                last
              />
            </View>
          </GlassCard>

          <GlassCard padding={4}>
            <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon icon={Search} size={18} tone="gold" />
                <Text variant="h3">Search me kis baat par milun?</Text>
              </View>
              <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
                Off rakhne par koi is cheez ka filter lagakar aapko nahi dhoondh sakta. Aapki profile par ye jaankari phir bhi dikh sakti hai.
              </Text>
              {CONSENT_KEYS.map((k, i) => (
                <ListRow
                  key={k}
                  title={DISCOVER.sensitiveLabels[k] ?? k}
                  toggle={{ value: Boolean(consent.data?.[k]), onChange: (v) => setConsent.mutate({ [k]: v }) }}
                  last={i === CONSENT_KEYS.length - 1}
                />
              ))}
            </View>
          </GlassCard>
        </View>
      )}
    </Screen>
  );
}
