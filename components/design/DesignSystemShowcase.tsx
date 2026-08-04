"use client";

import { useState } from "react";
import {
  Copy,
  Heart,
  Home,
  Mail,
  MessageSquareText,
  Phone,
  Users,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Field from "@/components/ui/Field";
import { Checkbox, ChipGroup, ChoiceCard, Select, Switch } from "@/components/ui/Controls";
import CountUp from "@/components/ui/CountUp";
import ProgressRing from "@/components/ui/ProgressRing";
import Sheet from "@/components/ui/Sheet";
import Celebrate from "@/components/ui/Celebrate";
import {
  Skeleton,
  SkeletonField,
  SkeletonMetric,
  SkeletonReelCard,
  SkeletonRow,
} from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { Container, Eyebrow, Section } from "@/components/ui/Container";
import FieldFillStream, { type StreamField } from "@/components/profile/FieldFillStream";
import VoiceCapture from "@/components/profile/VoiceCapture";
import JourneyStepper from "@/components/profile/JourneyStepper";

/* MOCK — showcase only, never used in the product */
const STREAM_FIELDS: StreamField[] = [
  { key: "name", label: "Poora Naam", value: "Rahul Sharma", confidence: 96 },
  { key: "dob", label: "Janm Tithi", value: "12 May 1995", confidence: 74 },
  { key: "edu", label: "Education", value: "B.Tech (Computer Science)", confidence: 89 },
  { key: "job", label: "Profession", value: "Software Engineer", confidence: 93 },
  { key: "city", label: "Current City", value: "New Delhi", confidence: 97 },
  { key: "state", label: "State", value: "Delhi", confidence: 99, inferred: true },
  { key: "income", label: "Annual Income", value: null, confidence: 0 },
];

const JOURNEY_STEPS = [
  { key: "basic", label: "Basic details", hint: "Naam, age, sheher", unlocks: "Profile live ho jayegi" },
  { key: "family", label: "Family details", hint: "Ghar me kaun-kaun hain", unlocks: "40% zyada profiles aapko dhoondh payengi" },
  { key: "prefs", label: "Partner preferences", unlocks: "Matches unlock" },
  { key: "photo", label: "Photo", unlocks: "3x zyada response" },
  { key: "verify", label: "Verification", locked: true, unlocks: "Verified badge" },
];

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg">{title}</h3>
        {note && <p className="mt-1 text-[0.8125rem] text-muted">{note}</p>}
      </div>
      {children}
    </div>
  );
}

export default function DesignSystemShowcase() {
  const { toast } = useToast();
  const [sheet, setSheet] = useState<null | "bottom" | "side" | "center">(null);
  const [choice, setChoice] = useState("nuclear");
  const [chips, setChips] = useState<string[]>(["travel"]);
  const [step, setStep] = useState(1);
  const [streamKey, setStreamKey] = useState(0);
  const [party, setParty] = useState(false);

  return (
    <main className="min-h-dvh bg-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <Container size="wide">
          <div className="flex h-16 items-center justify-between gap-4">
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg leading-none">
                BandhanTak <span className="text-primary-text">Design System</span>
              </p>
              <p className="text-[0.6875rem] text-muted">v2 · bandhantak.com palette · Poppins + Inter</p>
            </div>
            <ThemeToggle />
          </div>
        </Container>
      </div>

      <Container size="wide">
        <div className="space-y-16 py-10">
          {/* ---------- TOKENS ---------- */}
          <Section className="!py-0">
            <Eyebrow>Foundation</Eyebrow>
            <h2 className="mt-3 text-2xl">Colour &amp; contrast</h2>
            <p className="mt-2 max-w-2xl text-[0.9375rem] text-muted">
              Palette lifted from the live site. The contrast rule is the important part —
              gold-500 is a fill, never text.
            </p>

            <div className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s) => (
                <div key={s} className="space-y-1.5">
                  <div
                    className="h-14 rounded-md border border-line"
                    style={{ backgroundColor: `var(--color-gold-${s})` }}
                  />
                  <p className="text-[0.625rem] tabular-nums text-muted">{s}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Card variant="soft" padding="md">
                <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-muted">Fill</p>
                <div className="mt-2 rounded-md bg-primary px-4 py-3">
                  <span className="text-sm font-semibold text-primary-fg">gold-500 + dark text</span>
                </div>
              </Card>
              <Card variant="soft" padding="md">
                <p className="text-[0.75rem] font-semibold uppercase tracking-wider text-muted">Text</p>
                <p className="mt-2 text-lg font-semibold text-primary-text">gold-700 · 5.43:1 ✅</p>
              </Card>
              <Card variant="danger" padding="md">
                <p className="text-[0.75rem] font-semibold uppercase tracking-wider">Banned</p>
                <p className="mt-2 text-lg font-semibold" style={{ color: "var(--color-gold-500)" }}>
                  gold-500 text · 2.24:1 ❌
                </p>
              </Card>
            </div>
          </Section>

          {/* ---------- PROFILE JAADU ---------- */}
          <Section className="!py-0">
            <Eyebrow>Signature</Eyebrow>
            <h2 className="mt-3 text-2xl">Profile building</h2>
            <p className="mt-2 max-w-2xl text-[0.9375rem] text-muted">
              The three moments that have to feel like magic — because this is where users
              decide whether the AI is real.
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card variant="elevated" padding="lg">
                <Block
                  title="Biodata → fields, live"
                  note="Null values stay visible. Inferred values are visually separate."
                >
                  <FieldFillStream key={streamKey} fields={STREAM_FIELDS} autoPlay intervalMs={800} />
                  <Button variant="secondary" size="sm" onClick={() => setStreamKey((k) => k + 1)}>
                    Dobara chalayein
                  </Button>
                </Block>
              </Card>

              <div className="space-y-6">
                <Card variant="elevated" padding="lg">
                  <Block title="Voice capture" note="Waveform is driven by real mic amplitude.">
                    <VoiceCapture />
                  </Block>
                </Card>

                <Card variant="elevated" padding="lg">
                  <Block title="Journey stepper" note="Each step advertises what it unlocks.">
                    <JourneyStepper
                      steps={JOURNEY_STEPS}
                      currentIndex={step}
                      completionPercent={[10, 34, 58, 76, 100][step] ?? 34}
                      onStepClick={setStep}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                        Peeche
                      </Button>
                      <Button size="sm" onClick={() => setStep((s) => Math.min(4, s + 1))}>
                        Aage — milestone dekhen
                      </Button>
                    </div>
                  </Block>
                </Card>
              </div>
            </div>
          </Section>

          {/* ---------- SCORES ---------- */}
          <Section className="!py-0">
            <Eyebrow>Scores</Eyebrow>
            <h2 className="mt-3 text-2xl">Rings &amp; numbers</h2>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card padding="lg" className="flex flex-col items-center gap-3">
                <ProgressRing value={82} label="Trust" />
                <p className="text-center text-[0.8125rem] text-muted">Single value</p>
              </Card>

              <Card padding="lg" className="flex flex-col items-center gap-3">
                <ProgressRing
                  label="Match"
                  segments={[
                    { key: "pref", label: "Preferences", value: 88, color: "#c9a96e" },
                    { key: "deep", label: "Deep profile", value: 79, color: "#ddac51" },
                    { key: "trust", label: "Trust", value: 91, color: "#1f7a5a" },
                    { key: "act", label: "Activity", value: 70, color: "#ebd3a0" },
                    { key: "net", label: "Network", value: 60, color: "#7a1f2b" },
                  ]}
                />
                <p className="text-center text-[0.8125rem] text-muted">
                  Segmented — every arc is explainable
                </p>
              </Card>

              <Card padding="lg" className="flex flex-col items-center gap-3">
                <ProgressRing unknown label="Match" />
                <p className="text-center text-[0.8125rem] text-muted">
                  Confidence &lt; 0.6 → no fake number
                </p>
              </Card>

              <Card padding="lg" className="flex flex-col justify-center gap-4">
                <div>
                  <p className="text-[0.6875rem] uppercase tracking-wider text-muted">Total mila</p>
                  <p className="font-[family-name:var(--font-display)] text-3xl">
                    <CountUp value={48200} prefix="₹" indianFormat />
                  </p>
                </div>
                <div>
                  <p className="text-[0.6875rem] uppercase tracking-wider text-muted">Log bheje</p>
                  <p className="font-[family-name:var(--font-display)] text-3xl">
                    <CountUp value={247} />
                  </p>
                </div>
              </Card>
            </div>
          </Section>

          {/* ---------- CONTROLS ---------- */}
          <Section className="!py-0">
            <Eyebrow>Forms</Eyebrow>
            <h2 className="mt-3 text-2xl">Controls</h2>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card padding="lg" className="space-y-5">
                <Input label="Poora naam" placeholder="Rahul Sharma" required />
                <Input
                  label="Mobile number"
                  placeholder="98765 43210"
                  prefix={<Phone />}
                  helperText="OTP isi number par aayega"
                />
                <Input
                  label="Email"
                  prefix={<Mail />}
                  defaultValue="galat-email"
                  error="Email sahi nahi lag raha"
                />
                <Field label="Current city" aiFilled={{ confidence: 74 }} hint="AI ne biodata se nikala — check kar lijiye">
                  <Input defaultValue="New Delhi" />
                </Field>
                <Textarea
                  label="Apne baare me"
                  placeholder="Do line me bataiye…"
                  maxLength={300}
                  showCount
                  autoGrow
                />
              </Card>

              <Card padding="lg" className="space-y-6">
                <Field label="Family setup">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <ChoiceCard name="family" value="joint" checked={choice === "joint"} onSelect={setChoice} title="Joint" icon={<Users />} />
                    <ChoiceCard name="family" value="nuclear" checked={choice === "nuclear"} onSelect={setChoice} title="Nuclear" icon={<Home />} />
                    <ChoiceCard name="family" value="flexible" checked={choice === "flexible"} onSelect={setChoice} title="Flexible" icon={<Heart />} />
                  </div>
                </Field>

                <Field label="Interests" hint="Zyada se zyada 4">
                  <ChipGroup
                    max={4}
                    selected={chips}
                    onToggle={(v) => setChips((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]))}
                    options={[
                      { value: "travel", label: "Travel" },
                      { value: "music", label: "Music" },
                      { value: "cooking", label: "Cooking" },
                      { value: "fitness", label: "Fitness" },
                      { value: "reading", label: "Reading" },
                      { value: "movies", label: "Movies" },
                    ]}
                  />
                </Field>

                <Field label="Profession">
                  <Select
                    placeholder="Chuniye…"
                    options={[
                      { value: "it", label: "IT / Software" },
                      { value: "gov", label: "Government" },
                      { value: "biz", label: "Business" },
                    ]}
                  />
                </Field>

                <div className="space-y-1 border-t border-line pt-4">
                  <Switch label="Naye interests" description="Push notification" defaultChecked />
                  <Switch label="Payment alerts" description="Zaroori hai — band nahi ho sakta" locked defaultChecked />
                </div>

                <Checkbox
                  label="Main terms se sahmat hu"
                  description="Privacy policy aur terms of use"
                />
              </Card>
            </div>
          </Section>

          {/* ---------- BUTTONS + FEEDBACK ---------- */}
          <Section className="!py-0">
            <Eyebrow>Actions</Eyebrow>
            <h2 className="mt-3 text-2xl">Buttons, overlays, feedback</h2>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card padding="lg" className="space-y-5">
                <Block title="Buttons" note="Every size ≥ 48px (D-23).">
                  <div className="flex flex-wrap gap-2">
                    <Button>Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="ai-action" icon={<MessageSquareText className="size-4" />}>
                      AI se poocho
                    </Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="danger">Danger</Button>
                    <Button variant="success">Success</Button>
                    <Button loading>Loading</Button>
                    <Button size="icon" variant="secondary" ariaLabel="Copy">
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </Block>

                <Block title="Pills">
                  <div className="flex flex-wrap gap-2">
                    <Pill tone="gold">Verified</Pill>
                    <Pill tone="trust">ID verified</Pill>
                    <Pill tone="wine">Premium</Pill>
                    <Pill tone="danger">Blocked</Pill>
                    <Pill tone="neutral">Pending</Pill>
                  </div>
                </Block>

                <Block title="Toasts">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => toast({ tone: "success", title: "Interest bhej diya", description: "Priya ko notification chali gayi." })}>
                      Success
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => toast({ tone: "error", title: "Payment fail hua", description: "Card decline ho gaya.", action: { label: "Dobara koshish", onClick: () => {} } })}>
                      Error
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => toast({ tone: "warning", title: "Dhyan dijiye", description: "Is message me paise ka zikr hai." })}>
                      Warning
                    </Button>
                  </div>
                </Block>

                <Block title="Celebration" note="Rationed — milestones only.">
                  <div className="relative grid h-24 place-items-center rounded-md border border-line bg-bg-subtle">
                    <Celebrate trigger={party} onDone={() => setParty(false)} />
                    <Button size="sm" onClick={() => setParty(true)}>Profile complete 🎉</Button>
                  </div>
                </Block>
              </Card>

              <Card padding="lg" className="space-y-5">
                <Block title="Overlays" note="Focus trap, Escape, scroll lock, drag-to-dismiss.">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setSheet("bottom")}>Bottom sheet</Button>
                    <Button variant="secondary" size="sm" onClick={() => setSheet("side")}>Side drawer</Button>
                    <Button variant="secondary" size="sm" onClick={() => setSheet("center")}>Modal</Button>
                  </div>
                </Block>

                <Block title="Skeletons" note="Shaped like the real content, not generic bars.">
                  <div className="space-y-3">
                    <SkeletonMetric />
                    <SkeletonRow />
                    <SkeletonField />
                    <div className="max-w-[220px]">
                      <SkeletonReelCard />
                    </div>
                  </div>
                </Block>
              </Card>
            </div>
          </Section>

          {/* ---------- CARDS ---------- */}
          <Section className="!py-0">
            <Eyebrow>Surfaces</Eyebrow>
            <h2 className="mt-3 text-2xl">Cards</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(["default", "soft", "elevated", "interactive", "trust", "warning", "danger", "info"] as const).map((v) => (
                <Card key={v} variant={v} padding="lg">
                  <p className="text-sm font-semibold capitalize">{v}</p>
                  <p className="mt-1 text-[0.8125rem] text-muted">Card variant</p>
                </Card>
              ))}
            </div>
          </Section>
        </div>
      </Container>

      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        variant={sheet ?? "bottom"}
        title="Interest bhejein?"
        description="Priya ko notification jayegi aur aapki profile unhe dikhegi."
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setSheet(null)}>Cancel</Button>
            <Button fullWidth onClick={() => { setSheet(null); toast({ tone: "success", title: "Interest bhej diya" }); }}>
              Haan, bhejein
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[0.9375rem] leading-relaxed text-muted">
            Mobile par ise neeche drag karke band kar sakte hain. Escape bhi kaam karta hai,
            aur focus andar hi trap rehta hai.
          </p>
          <Skeleton className="h-24 w-full" />
        </div>
      </Sheet>
    </main>
  );
}
