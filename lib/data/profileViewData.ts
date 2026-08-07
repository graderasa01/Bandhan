import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { getKundliNotes } from "@/lib/services/kundli/kundliService";
import { buildVibeLine } from "@/lib/profile/mindset";
import { buildPhotoSlides } from "@/lib/services/profile/photoSlides";
import { atLeast, getProfileVisibility } from "@/lib/services/profile/visibility";
import { getAskedStatusMap } from "@/lib/services/askBridge/profileQuestionService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { canViewerUnlockPhotos } from "@/lib/services/plans/photoAccess";
import type { ProfileViewModel, ProfileViewRow, ProfileViewSection } from "@/lib/contracts/profileView";

/**
 * Builds the candidate view for one profile at the viewer's level.
 *
 * The level split is not a fresh opinion — it matches what the app already
 * says out loud elsewhere, so a user can never catch two parts of the product
 * disagreeing about the same field:
 *
 *  L1  the set `/api/reel/ask` already lets the AI answer from ("§23.3 — only
 *      what's allowed to be visible to a viewer ever reaches the prompt"):
 *      age, city, marital status, education, profession, family type, diet,
 *      smoking, drinking, hobbies, languages, relocation, bio. If the AI will
 *      say it to a stranger, hiding it on the page would be theatre.
 *
 *  L2  background a person weighing a real proposal needs: college/degree,
 *      work city, native place, height, religion/community/mother tongue,
 *      parents' occupations, siblings, family values, partner preferences.
 *      Still no photo, no contact — nothing that identifies them off-platform.
 *
 *  L3  what the ask prompt names as private and promises only "mutual interest
 *      ke baad": caste, gotra, manglik, income range — plus the photo, on the
 *      same Match rule the reel and shortlist already use.
 *
 * Never at any level: birthTime, birthPlace, the full date of birth, mobile.
 * Those are refused in `lib/profile/fields.ts` at the moment the user types
 * them, and the ones below simply never get selected.
 */

const VIEW_SELECT = {
  id: true,
  userId: true,
  displayName: true,
  dateOfBirth: true, // age only — the date itself never leaves this file
  maritalStatus: true,
  heightCm: true,
  currentCity: true,
  currentState: true,
  nativePlace: true,
  bioText: true,
  trustScore: true,
  trustScoreLabel: true,
  profileStatus: true,
  isVisible: true,
  deletedAt: true,
  user: { select: { mobileVerifiedAt: true } },
  basicDetails: {
    select: {
      motherTongue: true,
      religion: true,
      community: true,
      caste: true,
      gotra: true,
      manglikStatus: true,
      // birthTime / birthPlace deliberately absent — same omission as reelData.ts.
    },
  },
  education: { select: { highestEducation: true, degreeName: true, collegeName: true } },
  profession: {
    select: {
      professionCategory: true,
      jobTitle: true,
      companyName: true,
      annualIncomeRange: true,
      workCity: true,
    },
  },
  family: {
    select: {
      familyType: true,
      familyBackgroundSummary: true,
      fatherOccupation: true,
      motherOccupation: true,
      siblingsCount: true,
      siblingsMarriedStatus: true,
      familyValues: true,
    },
  },
  lifestyle: {
    select: {
      diet: true,
      smoking: true,
      drinking: true,
      hobbies: true,
      languagesKnown: true,
      relocateWilling: true,
      weekendVibe: true,
      bigDecisionStyle: true,
      socialEnergy: true,
    },
  },
  partnerPreferences: {
    select: {
      minAge: true,
      maxAge: true,
      preferredCities: true,
      educationPreference: true,
      maritalStatusPreference: true,
      partnerWorkExpectation: true,
    },
  },
  // Every non-deleted photo, not just the primary — Reel Slides (Phase 2)
  // needs the owner's full curated set to build the slide deck, the same way
  // reelData.ts already does.
  photos: {
    where: { deletedAt: null },
    select: {
      id: true,
      fileUrl: true,
      isPrimary: true,
      verificationStatus: true,
      note: true,
      slotOrder: true,
      focalY: true,
      deletedAt: true, // always null here (the where clause guarantees it) — selected only to satisfy PhotoSlideSource's shape
    },
  },
} as const;

const OPTED_OUT = "Hum nahi maante";

function row(label: string, value: string | null | undefined): ProfileViewRow | null {
  return value && value.trim() ? { label, value: value.trim() } : null;
}

/** Drops empty rows — a profile printing "Gotra: —" reads as broken, not private. */
function section(title: string, rows: (ProfileViewRow | null)[]): ProfileViewSection | null {
  const present = rows.filter((r): r is ProfileViewRow => r !== null);
  return present.length > 0 ? { title, rows: present } : null;
}

function list(values: string[] | undefined | null): string | null {
  return values && values.length > 0 ? values.join(", ") : null;
}

function heightLabel(cm: number | null): string | null {
  if (!cm) return null;
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}" (${cm} cm)`;
}

function ageRange(min: number | null, max: number | null): string | null {
  if (min && max) return `${min}–${max} saal`;
  if (min) return `${min}+ saal`;
  if (max) return `${max} saal tak`;
  return null;
}

const LOCKED_HINTS = {
  L1: {
    title: "Interest bhejne par aur khulega",
    description:
      "College, kaam ka sheher, mool nivas, parivaar ki jaankari aur unki jeevansaathi se apeksha — interest bhejte hi ye sab dikhne lagega.",
  },
  L2: {
    title: "Match hone par poori profile khulegi",
    description:
      "Photo, jaati, gotra, manglik aur aay ki range — ye sirf tab dikhte hain jab dono taraf se haan ho jaye. Aapki bhi yahi suraksha hai.",
  },
} as const;

export async function getProfileView(
  viewerUserId: string,
  profileId: string,
): Promise<ProfileViewModel | null> {
  const p = await prisma.profile.findUnique({ where: { id: profileId }, select: VIEW_SELECT });
  if (!p || p.deletedAt) return null;

  const visibility = await getProfileVisibility(viewerUserId, p.userId);

  // A profile the owner has never published stays invisible to everyone but
  // its owner, regardless of level — an interest can't conjure a right to see
  // a draft.
  if (!visibility.isSelf && (!p.isVisible || p.profileStatus === "DRAFT")) return null;

  const [viewer, shortlist, askedStatuses, askBridgeGate, canUnlockPhotos] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId: viewerUserId },
      select: { basicDetails: { select: { gotra: true, manglikStatus: true } } },
    }),
    prisma.shortlist.findUnique({
      where: { userId_targetProfileId: { userId: viewerUserId, targetProfileId: p.id } },
      select: { id: true },
    }),
    // No self-ask row can ever exist (askProfileQuestion blocks it), so this
    // is safe to call unconditionally rather than branching on isSelf.
    getAskedStatusMap(viewerUserId, [p.userId]),
    isFeatureAvailable(viewerUserId, "askBridge"),
    canViewerUnlockPhotos(viewerUserId),
  ]);

  const { level } = visibility;
  const showL2 = atLeast(level, "L2");
  const showL3 = atLeast(level, "L3");
  // The photo is now a *separate* gate from L3, not the same one.
  //
  // A paid plan opens photos (`photoUnlockAll`, 2026-08-07) — it does not open
  // caste, gotra, manglik or income, which are the other things `showL3`
  // guards and which the profile builder still promises stay private until
  // mutual interest. Reusing `showL3` for both would have quietly sold those
  // four fields along with the picture. Keep them separate.
  const showPhoto = showL3 || canUnlockPhotos;

  const basic = p.basicDetails;
  const edu = p.education;
  const job = p.profession;
  const family = p.family;
  const life = p.lifestyle;
  const prefs = p.partnerPreferences;
  const photo = p.photos.find((ph) => ph.isPrimary) ?? p.photos[0];

  const vibe = life
    ? buildVibeLine({
        weekendVibe: life.weekendVibe ?? "",
        bigDecisionStyle: life.bigDecisionStyle ?? "",
        socialEnergy: life.socialEnergy ?? "",
      })
    : null;

  const sections = [
    section("Ek Nazar Me", [
      row("Umar", p.dateOfBirth ? `${ageFromDate(p.dateOfBirth)} saal` : null),
      row("Sheher", [p.currentCity, p.currentState].filter(Boolean).join(", ") || null),
      row("Marital Status", p.maritalStatus),
      showL2 ? row("Height", heightLabel(p.heightCm)) : null,
      showL2 ? row("Mool Nivas", p.nativePlace) : null,
      showL2 ? row("Matra Bhasha", basic?.motherTongue) : null,
    ]),

    section("Shiksha Aur Kaam", [
      row("Shiksha", edu?.highestEducation),
      showL2 ? row("Degree", edu?.degreeName) : null,
      showL2 ? row("College", edu?.collegeName) : null,
      row("Kaam", [job?.jobTitle, job?.professionCategory].filter(Boolean).join(" · ") || null),
      showL2 ? row("Company", job?.companyName) : null,
      showL2 ? row("Karya Sthal", job?.workCity) : null,
      // The ask prompt calls income private and promises it "sirf mutual
      // interest ke baad". Only the range is ever stored — fields.ts tells the
      // user "sirf range dikhti hai — exact number kabhi nahi".
      showL3 ? row("Varshik Aay", job?.annualIncomeRange) : null,
    ]),

    section("Parivaar", [
      row("Parivaar Ka Prakar", family?.familyType),
      showL2 ? row("Pita Ji", family?.fatherOccupation) : null,
      showL2 ? row("Mata Ji", family?.motherOccupation) : null,
      showL2
        ? row(
            "Bhai / Behen",
            [family?.siblingsCount, family?.siblingsMarriedStatus].filter(Boolean).join(" · ") || null,
          )
        : null,
      showL2 ? row("Parivaar Ke Sanskar", family?.familyValues) : null,
      showL2 ? row("Parivaar Ke Baare Me", family?.familyBackgroundSummary) : null,
    ]),

    section("Jeevan Shaili", [
      row("Khaan-Paan", life?.diet),
      row("Smoking", life?.smoking),
      row("Drinking", life?.drinking),
      row("Bhashayein", list(life?.languagesKnown)),
      row("Shauk", list(life?.hobbies)),
      row("Relocation", life?.relocateWilling),
    ]),

    // Religion at L1 is the community line families screen on first; caste and
    // gotra are the two the ask prompt names as private, so they wait for L3.
    section("Parampara", [
      row("Dharm", basic?.religion),
      row("Samaj / Community", basic?.community),
      showL3 ? row("Jaati", basic?.caste) : null,
      showL3 ? row("Gotra", basic?.gotra) : null,
      showL3 && basic?.manglikStatus !== OPTED_OUT ? row("Manglik", basic?.manglikStatus) : null,
    ]),

    showL2
      ? section("Jeevansaathi Se Apeksha", [
          row("Umar", ageRange(prefs?.minAge ?? null, prefs?.maxAge ?? null)),
          row("Sheher", list(prefs?.preferredCities)),
          row("Shiksha", prefs?.educationPreference),
          row("Marital Status", prefs?.maritalStatusPreference),
          row("Kaam Ko Lekar", prefs?.partnerWorkExpectation),
        ])
      : null,
  ].filter((s): s is ProfileViewSection => s !== null);

  return {
    profileId: p.id,
    displayName: p.displayName ?? "Profile",
    age: ageFromDate(p.dateOfBirth),
    city: p.currentCity,
    headline: [edu?.highestEducation, job?.jobTitle].filter(Boolean).join(" · ") || null,
    bio: p.bioText?.trim() || vibe,

    // Withheld, not hidden. `public/uploads/**` is served statically with no
    // auth, so shipping the URL and covering it with a lock panel is a gate
    // anyone defeats by opening view-source. Locked means the client never
    // receives the address.
    photoUrl: showPhoto ? (photo?.fileUrl ?? null) : null,
    photoUnlocked: showPhoto,
    photoFocalY: showPhoto ? (photo?.focalY ?? null) : null,
    // Same withheld-not-hidden rule as photoUrl — see the note above it.
    slides: showPhoto ? buildPhotoSlides(p.photos) : [],
    photoVerified: photo?.verificationStatus === "APPROVED",
    mobileVerified: Boolean(p.user?.mobileVerifiedAt),
    trustScore: p.trustScore,
    trustScoreLabel: p.trustScoreLabel,

    level,
    isSelf: visibility.isSelf,
    sections,
    // Display-only, and shown from L1 — the same notes the reel card already
    // carries. Worth naming the tension: "gotra ek hi hai" does tell a viewer
    // who knows their own gotra what the other person's is, ahead of L3. It
    // stays anyway, because gotra is the first check most families run, and
    // learning it only after a match is the outcome that actually hurts. The
    // *value* still waits for L3; only the comparison is early.
    kundliNotes: visibility.isSelf
      ? []
      : getKundliNotes(
          { gotra: viewer?.basicDetails?.gotra, manglikStatus: viewer?.basicDetails?.manglikStatus },
          { gotra: basic?.gotra, manglikStatus: basic?.manglikStatus },
        ),
    lockedHint: visibility.isSelf ? null : level === "L3" ? null : LOCKED_HINTS[level],

    interestSent: visibility.interestSent,
    interestReceived: visibility.interestReceived,
    matchId: visibility.matchId,
    shortlisted: Boolean(shortlist),

    askedStatus: askedStatuses.get(p.userId) ?? "NONE",
    askBridgeEnabled: askBridgeGate.allowed,
  };
}
