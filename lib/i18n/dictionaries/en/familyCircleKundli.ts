/**
 * Data/service-layer copy for Family Circle, Serious Circle, and Kundli
 * (astrology matching) — Phase 2 of the English toggle. These strings are
 * generated inside lib/services and lib/data functions (not JSX), and are
 * threaded through via an optional `t` parameter that defaults to a no-op.
 */
const familyCircleKundli: Record<string, string> = {
  // ---------------------------------------------------------------------
  // Family Circle — lib/services/family/familyPortalActions.ts
  // ---------------------------------------------------------------------
  "family.portal.error.forbidden": "This action isn't available for your role.",
  "family.portal.error.profileNotFound": "Profile not found.",
  "family.portal.error.notAMatch": "You can only shortlist someone from your matches.",
  "family.portal.error.notYourShortlist": "This isn't an entry you shortlisted.",
  "family.portal.error.noteLength": "The note must be between 1 and 500 characters.",

  // ---------------------------------------------------------------------
  // Family Circle — lib/services/family/familyService.ts
  // ---------------------------------------------------------------------
  "family.invite.error.nameRequired": "Name is required.",
  "family.invite.error.seatLimit": "Your plan allows only {limit} family seat{plural}.",
  "family.invite.error.duplicateName":
    "A member with this name already exists. Choose a different name (like \"Dad\" and \"Uncle\").",
  "family.member.error.notFound": "Member not found.",
  "family.activity.profileFallback": "Profile",

  // ---------------------------------------------------------------------
  // Serious Circle — lib/services/circle/circleService.ts
  // ---------------------------------------------------------------------
  "circle.profileFallback": "Profile",
  "circle.action.error.noProfile": "Please create your profile first.",
  "circle.action.error.noEvent": "No Circle is scheduled right now.",
  "circle.action.error.registrationClosed": "Registration for this Circle has closed. The next Circle is coming soon.",
  "circle.action.error.notEligible": "You can't enter right now.",
  "circle.action.error.noGender": "You need to fill in your gender in your profile.",
  "circle.action.error.noEventFound": "No Circle found.",
  "circle.action.error.locked": "The roster is already locked — you can no longer withdraw your name.",

  // ---------------------------------------------------------------------
  // Serious Circle — lib/services/circle/connectionService.ts
  // ---------------------------------------------------------------------
  "circle.connection.error.notFound": "This connection wasn't found.",
  "circle.connection.error.forbidden": "This connection isn't yours.",
  "circle.connection.error.notOpen": "The Circle hasn't started yet.",
  "circle.connection.error.closed": "This Circle's time has ended.",
  "circle.connection.error.alreadyAnswered": "You've already answered.",

  // ---------------------------------------------------------------------
  // Discovery (Matches / Interests) — lib/data/discoveryData.ts
  // ---------------------------------------------------------------------
  "discovery.profileFallback": "Profile",
  "discovery.matches.emptyTitle": "No matches yet.",
  "discovery.matches.emptyDescription": "Swipe on Rishta Reel to make matches.",
  "discovery.you": "You",
  "discovery.interests.emptyReceivedTitle": "No interests received yet.",
  "discovery.interests.emptyReceivedDescription": "Complete your profile so matches can find you.",
  "discovery.interests.emptySentTitle": "No interests sent yet.",
  "discovery.interests.emptySentDescription": "Explore Rishta Reel and send interest.",

  // ---------------------------------------------------------------------
  // Kundli — lib/services/kundli/manualKundliService.ts
  // ---------------------------------------------------------------------
  "kundli.manual.error.invalidDob": "This date of birth doesn't look right.",
  "kundli.manual.error.locked": "Upgrade your plan to generate an instant kundli, or complete a mission to earn an unlock.",
  "kundli.manual.error.buildFailed": "Could not generate the kundli. Please check the date again.",

  // ---------------------------------------------------------------------
  // Kundli notes (gotra / manglik) — lib/services/kundli/kundliService.ts
  // ---------------------------------------------------------------------
  "kundli.notes.gotra.title": "Same gotra",
  "kundli.notes.gotra.detail":
    "Many families avoid marrying within the same gotra, while many others don't mind it. This is just information — the decision is yours and your family's.",
  "kundli.notes.manglik.unknown.title": "Manglik status unknown",
  "kundli.notes.manglik.unknown.detail":
    "One side's Manglik status isn't known. If this matters in your family, do check with a pandit.",
  "kundli.notes.manglik.bothYes.title": "Both Manglik",
  "kundli.notes.manglik.bothYes.detail":
    "Both have the same Manglik status — tradition generally considers this fine.",
  "kundli.notes.manglik.bothNo.title": "Neither is Manglik",
  "kundli.notes.manglik.bothNo.detail": "The Manglik status matches on both sides.",
  "kundli.notes.manglik.partial.title": "Partially Manglik",
  "kundli.notes.manglik.partial.detail":
    "One side has a partial Manglik status. Many families accept this easily — it's still best to ask.",
  "kundli.notes.manglik.differs.title": "Manglik status differs",
  "kundli.notes.manglik.differs.detail":
    "One is Manglik and the other isn't. Some families get this checked with a pandit, while many others don't consider it an issue.",

  // ---------------------------------------------------------------------
  // Guna Milan (36-point compatibility) — lib/services/kundli/gunaMilan.ts
  // ---------------------------------------------------------------------
  "kundli.guna.varna.label": "Varna",
  "kundli.guna.varna.meaning": "The order of temperament between the two — attitude toward work, and ego.",
  "kundli.guna.varna.verdict.ok": "According to tradition, this order is fine.",
  "kundli.guna.varna.verdict.no":
    "Tradition considers this order less favourable. These days it's treated as the lightest factor — only 1 point out of the full 36.",

  "kundli.guna.vashya.label": "Vashya",
  "kundli.guna.vashya.meaning": "How naturally each person influences the other — who tends to rely on whom.",
  "kundli.guna.vashya.verdict.full": "Both Vashya groups are compatible with each other.",
  "kundli.guna.vashya.verdict.half": "Vashya is partly matched — half a point.",
  "kundli.guna.vashya.verdict.none": "These Vashya groups are not considered compatible.",

  "kundli.guna.tara.label": "Tara",
  "kundli.guna.tara.meaning": "Effect on each other's health and fortune — counted separately from each side.",
  "kundli.guna.tara.verdict.full": "Tara is favourable from both sides.",
  "kundli.guna.tara.verdict.half": "Tara is favourable from one side, not the other.",
  "kundli.guna.tara.verdict.none": "Tara falls in the unfavourable range on both sides.",

  "kundli.guna.yoni.label": "Yoni",
  "kundli.guna.yoni.meaning": "Physical and instinctive compatibility.",
  "kundli.guna.yoni.verdict.same": "Same Yoni — the most favourable match in tradition.",
  "kundli.guna.yoni.verdict.friend": "The two Yonis are considered friendly with each other.",
  "kundli.guna.yoni.verdict.neutral": "Yoni is neutral — neither especially favourable nor opposed.",
  "kundli.guna.yoni.verdict.enemy": "The two Yonis are considered opposed to each other.",
  "kundli.guna.yoni.verdict.worstEnemy": "Tradition considers these two Yonis to be complete opposites.",

  "kundli.guna.grahaMaitri.label": "Graha Maitri",
  "kundli.guna.grahaMaitri.meaning":
    "Whether the two moon-sign lords are friends with each other — a measure of mental compatibility.",
  "kundli.guna.grahaMaitri.verdict.friend": "Both sign-lords are friends with each other.",
  "kundli.guna.grahaMaitri.verdict.neutral": "The sign-lords are neutral toward each other.",
  "kundli.guna.grahaMaitri.verdict.oneSided": "Friendship exists on one side, not the other.",
  "kundli.guna.grahaMaitri.verdict.enemy": "Both sign-lords are considered enemies of each other.",

  "kundli.guna.gana.label": "Gana",
  "kundli.guna.gana.meaning": "The temperament category — calm, practical, or intense.",
  "kundli.guna.gana.verdict.full": "Both Ganas are compatible with each other.",
  "kundli.guna.gana.verdict.almost": "Gana is nearly compatible.",
  "kundli.guna.gana.verdict.diff": "There is a difference in Gana — tradition treats this as worth noting.",
  "kundli.guna.gana.verdict.opposite": "The two Ganas are considered opposed to each other.",

  "kundli.guna.bhakoot.label": "Bhakoot",
  "kundli.guna.bhakoot.meaning":
    "The distance between the two moon signs — linked, in tradition, to household prosperity and health.",
  "kundli.guna.bhakoot.verdict.dosha":
    "This forms a {dosha} dosha (a distance of {a}-{b}). Tradition treats this as a flaw, though many pandits consider it cancelled out when Graha Maitri is strong.",
  "kundli.guna.bhakoot.verdict.none": "The distance between the signs does not form any dosha.",

  "kundli.guna.nadi.label": "Nadi",
  "kundli.guna.nadi.meaning":
    "A difference in body constitution, similar to Ayurveda — the heaviest factor, worth the full 8 points.",
  "kundli.guna.nadi.verdict.diff": "The two Nadis are different — this is what tradition looks for.",
  "kundli.guna.nadi.verdict.same":
    "Both have the same Nadi (Nadi dosha). This alone takes away 8 points. If the birth star's quarter or moon sign differs, many pandits consider it cancelled out — it's best to have the full chart reviewed.",

  "kundli.guna.dosha.nadiTitle": "Nadi Dosha",
  "kundli.guna.dosha.bhakootTitle": "Bhakoot Dosha",

  // ---------------------------------------------------------------------
  // Kundli PDF export — lib/services/kundli/kundliPdf.ts
  // ---------------------------------------------------------------------
  "kundliPdf.heading": "BandhanTak - Birth Kundli",
  "kundliPdf.dobLabel": "Date of birth:",
  "kundliPdf.birthTimeLabel": "Time of birth:",
  "kundliPdf.birthPlaceLabel": "Place of birth:",

  "kundliPdf.chandraRashi.title": "Moon Sign",
  "kundliPdf.chandraRashi.rashiLabel": "Sign:",
  "kundliPdf.chandraRashi.nakshatraLabel": "Nakshatra:",
  "kundliPdf.chandraRashi.charanLabel": "Quarter:",
  "kundliPdf.chandraRashi.nakshatraLordLabel": "Nakshatra lord:",
  "kundliPdf.chandraRashi.note": "Where the Moon was at the time of birth - this is what kundli matching is based on.",

  "kundliPdf.lagna.title": "Lagna (Ascendant)",
  "kundliPdf.lagna.needTime":
    "The Ascendant is not in this kundli because the time of birth was not available. The Ascendant shifts by one degree every 4 minutes - guessing it without the time would produce an inaccurate kundli, so we don't generate one. The Moon sign and guna matching above are still fully accurate.",
  "kundliPdf.lagna.needPlace":
    "The Ascendant is not in this kundli because the place of birth could not be identified. The Ascendant depends on the longitude of the place. Adding the correct city name to the profile will produce the full kundli.",

  "kundliPdf.chart.title": "Birth Chart (North Indian style)",
  "kundliPdf.chart.legend":
    "The number inside each house is the sign. Planet codes: Su Sun, Ch Moon, Ma Mars, Bu Mercury, Gu Jupiter, Sk Venus, Sa Saturn, Ra Rahu, Ke Ketu.",

  "kundliPdf.grahaTable.title": "Planetary Positions",
  "kundliPdf.grahaTable.colGraha": "Planet",
  "kundliPdf.grahaTable.colRashi": "Sign",
  "kundliPdf.grahaTable.colNakshatra": "Nakshatra / Quarter",
  "kundliPdf.grahaTable.colBhava": "House",
  "kundliPdf.grahaTable.charanWord": "quarter",
  "kundliPdf.grahaTable.retrogradeNote": "(V) = retrograde",

  "kundliPdf.manglik.title": "Mangal Dosha",
  "kundliPdf.manglik.fromMoonPre": "A full determination isn't possible without the Ascendant. Looking from the Moon, Mars is in the",
  "kundliPdf.manglik.fromMoonMid": "house -",
  "kundliPdf.manglik.yes": "this falls in the Manglik category.",
  "kundliPdf.manglik.no": "this does not fall in the Manglik category.",
  "kundliPdf.manglik.fromLagnaPre": "From the Ascendant, Mars is in the",
  "kundliPdf.manglik.fromLagnaMid": "house, and from the Moon it is in the",
  "kundliPdf.manglik.fromLagnaPost": "house.",
  "kundliPdf.manglik.lagnaYes": "Based on the Ascendant, this falls in the Manglik category.",
  "kundliPdf.manglik.lagnaNo": "Based on the Ascendant, this does not fall in the Manglik category.",
  "kundliPdf.manglik.disclaimer":
    "There are several cancellation (bhang) rules for Mangal Dosha that can't be settled without reviewing the full chart. This only states the position, not a verdict.",

  "kundliPdf.footer.ayanamsa":
    "Calculations use the Lahiri (Chitrapaksha) ayanamsa, with the Moon's position accurate to under one arc-minute.",
  "kundliPdf.footer.disclaimer":
    "This is real calculation - but astrology and BandhanTak's matching are two separate things, and neither affects the other.",
};

export default familyCircleKundli;
