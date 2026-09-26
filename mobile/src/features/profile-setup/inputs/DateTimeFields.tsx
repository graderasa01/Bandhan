import { memo, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "~/components";
import { isPlausibleDate } from "~/catalog";
import { WheelPicker } from "./WheelPicker";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

function parseDmy(value: string): { d: number; m: number; y: number } | null {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return { d: Number(m[1]), m: Number(m[2]), y: Number(m[3]) };
}

type DateParts = { d: number | null; m: number | null; y: number | null };

/**
 * Day / month / year wheels. Stores DD/MM/YYYY — the format the catalog and
 * the server read — and only once all three have been chosen: a day or month
 * nobody picked is never saved as an answer.
 */
export const DateOfBirthPicker = memo(function DateOfBirthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 58 }, (_, i) => String(thisYear - 18 - i)), [thisYear]);
  const stored = parseDmy(value);
  const [picked, setPicked] = useState<DateParts>(() => stored ?? { d: null, m: null, y: null });
  const parts: DateParts = stored ?? picked;
  const yearIndex = parts.y ? Math.max(0, years.indexOf(String(parts.y))) : Math.max(0, years.indexOf(String(thisYear - 28)));

  const choose = (next: DateParts) => {
    setPicked(next);
    if (next.d && next.m && next.y) onChange(`${String(next.d).padStart(2, "0")}/${String(next.m).padStart(2, "0")}/${next.y}`);
  };
  const valid = value ? isPlausibleDate(value) : true;
  const partial = !stored && (parts.d !== null || parts.m !== null || parts.y !== null);

  return (
    <View style={styles.col}>
      <View style={styles.row}>
        <WheelPicker label="Din" values={DAYS} index={(parts.d ?? 1) - 1} unset={parts.d === null} onChange={(i) => choose({ ...parts, d: i + 1 })} width={78} />
        <WheelPicker label="Mahina" values={MONTHS} index={(parts.m ?? 1) - 1} unset={parts.m === null} onChange={(i) => choose({ ...parts, m: i + 1 })} />
        <WheelPicker label="Saal" values={years} index={yearIndex} unset={parts.y === null} onChange={(i) => choose({ ...parts, y: Number(years[i]) })} width={96} />
      </View>
      {partial ? (
        <Text variant="small" tone="muted">
          Din, mahina aur saal — teeno chuniye.
        </Text>
      ) : null}
      {!valid ? (
        <Text variant="small" tone="danger">
          Ye tareekh sahi nahi lag rahi — din aur mahina check kijiye.
        </Text>
      ) : null}
    </View>
  );
});

/**
 * Part of day / hour / minute — stores "subah 6:30" style Hinglish. Each part
 * of the day offers only the hours it can mean (components/profile/
 * quickInputs.tsx `PERIODS`): the kundli engine reads the word to tell AM from
 * PM, so "raat 12" must never be offered.
 */
const PERIODS: { label: string; word: string; hours: number[] }[] = [
  { label: "Subah", word: "subah", hours: [4, 5, 6, 7, 8, 9, 10, 11] },
  { label: "Dopahar", word: "dopahar", hours: [12, 1, 2, 3] },
  { label: "Shaam", word: "shaam", hours: [4, 5, 6, 7] },
  { label: "Raat", word: "raat", hours: [8, 9, 10, 11] },
  { label: "Tadke", word: "tadke", hours: [12, 1, 2, 3] },
];
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

export const BirthTimePicker = memo(function BirthTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = value.match(/^(\w+)\s+(\d{1,2}):(\d{2})$/);
  const periodIndex = Math.max(0, PERIODS.findIndex((p) => p.word === (m?.[1] ?? "subah")));
  const period = PERIODS[periodIndex]!;
  const hour = m ? Number(m[2]) : (period.hours[2] ?? period.hours[0]!);
  const minute = m ? m[3]! : "00";
  const hours = period.hours.map(String);

  const emit = (pIndex: number, h: number, min: string) => {
    const p = PERIODS[pIndex]!;
    const useHour = p.hours.includes(h) ? h : p.hours[0]!;
    onChange(`${p.word} ${useHour}:${min}`);
  };

  return (
    <View style={styles.row}>
      <WheelPicker label="Kab" values={PERIODS.map((p) => p.label)} index={periodIndex} onChange={(i) => emit(i, hour, minute)} />
      <WheelPicker label="Ghanta" values={hours} index={Math.max(0, hours.indexOf(String(hour)))} onChange={(i) => emit(periodIndex, period.hours[i]!, minute)} width={84} />
      <WheelPicker label="Minute" values={MINUTES} index={Math.max(0, MINUTES.indexOf(minute))} onChange={(i) => emit(periodIndex, hour, MINUTES[i]!)} width={84} />
    </View>
  );
});

/** "14/02/1996" → "14 Feb 1996" for summaries. */
export function formatDob(value: string | undefined): string | null {
  const p = value ? parseDmy(value) : null;
  if (!p) return value ?? null;
  return `${p.d} ${MONTHS[p.m - 1] ?? ""} ${p.y}`;
}

const styles = StyleSheet.create({
  col: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
});
