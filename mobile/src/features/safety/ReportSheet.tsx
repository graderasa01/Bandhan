import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheet, Chip, Input, ListRow, PrimaryButton, Text, toast } from "~/components";
import { REPORT_REASONS } from "~/catalog";
import { errorMessage } from "~/services/api/client";
import { safetyService } from "~/services/safety";
import { firstNameOf } from "~/utils/names";

/**
 * Report (and block) a person — the reasons are the web's own list (also the
 * admin queue's vocabulary), with a free-text box under them. Blocking is on
 * by default: after a report, the member should not keep receiving from them.
 */
export function ReportSheet({
  visible,
  onClose,
  target,
  name,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  target: { profileId?: string; userId?: string };
  name: string;
  /**
   * After the server has the report. Default: a block leaves the screen (a
   * profile or chat of somebody now blocked is a dead end). The reel passes its
   * own — it stays, and takes the card out of the deck instead.
   */
  onDone?: (blocked: boolean) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  // One sheet can serve many people (the reel): each report starts clean.
  const who = target.profileId ?? target.userId ?? null;
  const [prevWho, setPrevWho] = useState(who);
  if (who !== prevWho) {
    setPrevWho(who);
    if (who) {
      setReason(null);
      setDetails("");
      setBlock(true);
    }
  }

  async function submit() {
    if (!reason) return;
    setBusy(true);
    try {
      await safetyService.report({ ...target, reason, details: details.trim() || undefined, alsoBlock: block });
      toast.success(block ? "Report bhej diya aur block kar diya" : "Report bhej diya — hum dekhenge");
      onClose();
      if (onDone) onDone(block);
      else if (block) router.back();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Report ${firstNameOf(name)}`}
      subtitle="Aapki pehchaan unhe kabhi nahi batayi jaati."
      footer={<PrimaryButton label="Send Report" onPress={submit} loading={busy} disabled={!reason} />}
    >
      <View style={{ gap: 14 }}>
        <View style={styles.reasons}>
          {REPORT_REASONS.map((r) => (
            <Chip key={r} label={r} size="sm" selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <Input label="Kuch aur batana ho (optional)" value={details} onChangeText={setDetails} multiline multilineHeight={90} maxLength={1000} />
        <ListRow title="Block as well" subtitle="Ye aapko na dekh payenge, na message kar payenge" toggle={{ value: block, onChange: setBlock }} last />
        <Text variant="caption" tone="muted">
          Kisi ki jaan ya suraksha khatre me ho to turant 112 par call karein.
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
