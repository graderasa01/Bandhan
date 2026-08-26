/**
 * English for the two data catalogs: the dashboard's profile sections
 * (`lib/profile/fieldGroups.ts`) and Marriage Intelligence
 * (`lib/profile/intelligenceQuestions.ts`).
 *
 * Kept apart from `profile.ts` because these keys are not written by hand at a
 * call site — they are built by `lib/i18n/catalogKeys.ts` from a record's id,
 * and `scripts/i18n-catalog-check.ts` asserts this file covers every string
 * those catalogs expose. A question added there without a line here fails that
 * check instead of quietly rendering Hinglish inside an English screen.
 *
 * Option *labels* are translated; option *values* are not, and must not be —
 * the value is what gets stored and matched on. See `catalogKeys.ts`.
 */

const profileCatalog: Record<string, string> = {
  /* ---------------------------------------------------------------- */
  /* Profile sections — the dashboard's "Your Profile" card            */
  /* ---------------------------------------------------------------- */

  "profile.fieldCategory.basics.label": "About you",
  "profile.fieldCategory.basics.hint": "This is what people see first — your profile can't go live without it.",
  "profile.fieldCategory.career.label": "Education and work",
  "profile.fieldCategory.career.hint": "For most people this is the first thing they look at.",
  "profile.fieldCategory.family.label": "Family",
  "profile.fieldCategory.family.hint": "A marriage isn't only between two people — both sides get asked this.",
  "profile.fieldCategory.background.label": "Community and background",
  "profile.fieldCategory.background.hint": "Entirely optional. Leave anything you'd rather not share blank.",
  "profile.fieldCategory.lifestyle.label": "Everyday life",
  "profile.fieldCategory.lifestyle.hint": "Daily habits — these are what end up mattering most.",
  "profile.fieldCategory.partner.label": "What you want in a partner",
  "profile.fieldCategory.partner.hint": "The kind of match you're looking for. Nothing changes your matches more.",
  "profile.fieldCategory.kundli.label": "Kundli details",
  "profile.fieldCategory.kundli.hint": "Only used for kundli matching. Skip it if you don't follow it.",
  "profile.fieldCategory.photos.label": "Photos",
  "profile.fieldCategory.photos.hint": "One clear face photo does more for trust than anything else on a profile.",

  /* ---------------------------------------------------------------- */
  /* The nine intelligence areas                                       */
  /* ---------------------------------------------------------------- */

  "profile.intelligence.layer.INTENT.title": "Marriage intent",
  "profile.intelligence.layer.INTENT.unlocks":
    "Matches can now be compared on your timing and your family's timing",
  "profile.intelligence.layer.FAMILY_LIFE.title": "Life after marriage",
  "profile.intelligence.layer.FAMILY_LIFE.unlocks":
    "Joint vs nuclear and family expectations will line up better",
  "profile.intelligence.layer.CAREER.title": "Career and city",
  "profile.intelligence.layer.CAREER.unlocks":
    "Relocation and work expectations will be clear from the start",
  "profile.intelligence.layer.MONEY.title": "Money and responsibility",
  "profile.intelligence.layer.MONEY.unlocks":
    "Whether you think about money the same way now counts in matching",
  "profile.intelligence.layer.CHILDREN.title": "Children and parenting",
  "profile.intelligence.layer.CHILDREN.unlocks":
    "This is the biggest decision of all — a mismatch will show up early",
  "profile.intelligence.layer.LIFESTYLE.title": "Everyday life",
  "profile.intelligence.layer.LIFESTYLE.unlocks":
    "People whose routine and lifestyle match yours will move up",
  "profile.intelligence.layer.COMMUNICATION.title": "Talking and the relationship",
  "profile.intelligence.layer.COMMUNICATION.unlocks":
    "How you argue and how you talk — the real heart of compatibility",
  "profile.intelligence.layer.VALUES.title": "Values and tradition",
  "profile.intelligence.layer.VALUES.unlocks":
    "Your balance of tradition and modern will start being matched on",
  "profile.intelligence.layer.PARTNER_PREFERENCES.title": "What you want in a partner",
  "profile.intelligence.layer.PARTNER_PREFERENCES.unlocks":
    "You'll see which things are must-haves and which are flexible",

  /* "Ye pehle se pata hai" chips, keyed by the profile field they read. */
  "profile.intelligence.known.familyType": "Family now",
  "profile.intelligence.known.profession": "Profession",
  "profile.intelligence.known.diet": "Diet",
  "profile.intelligence.known.hobbies": "Interests",
  "profile.intelligence.known.weekendVibe": "Weekend vibe",
  "profile.intelligence.known.socialEnergy": "Social energy",
  "profile.intelligence.known.familyValues": "Family values",
  "profile.intelligence.known.partnerAgeRange": "Age range",
  "profile.intelligence.known.partnerCityPreference": "City",
  "profile.intelligence.known.partnerEducation": "Education",

  /* ---------------------------------------------------------------- */
  /* Questions — Intent                                                */
  /* ---------------------------------------------------------------- */

  "profile.intelligence.q.marriageTimeline.label": "Marriage timeline",
  "profile.intelligence.q.marriageTimeline.question":
    "Realistically, by when do you want to be married?",
  "profile.intelligence.q.marriageTimeline.questionForChild":
    "Realistically, by when would you like them married?",
  "profile.intelligence.q.marriageTimeline.why":
    "Two people on completely different timelines rarely get anywhere — better to match on it upfront.",

  "profile.intelligence.q.relationshipReadiness.label": "Where you are now",
  "profile.intelligence.q.relationshipReadiness.question": "What stage are you at right now?",
  "profile.intelligence.q.relationshipReadiness.questionForChild": "What stage are they at right now?",
  "profile.intelligence.q.relationshipReadiness.why":
    "This shows you people at the same stage as you — neither rushing nor stalling.",

  "profile.intelligence.q.familyIntroductionTiming.label": "When family comes in",
  "profile.intelligence.q.familyIntroductionTiming.question":
    "At what stage would you prefer to involve family?",
  "profile.intelligence.q.familyIntroductionTiming.questionForChild":
    "At what stage will family be involved?",
  "profile.intelligence.q.familyIntroductionTiming.why":
    "Plenty of matches end only because one side brought family in early and the other wasn't ready yet.",

  "profile.intelligence.q.decisionOwnership.label": "The final call",
  "profile.intelligence.q.decisionOwnership.question":
    "How will the final decision about marriage generally be made?",
  "profile.intelligence.q.decisionOwnership.questionForChild":
    "How will the final decision about marriage be made?",
  "profile.intelligence.q.decisionOwnership.why":
    "Who makes the call — when this doesn't line up, things stall halfway.",

  "profile.intelligence.q.gettingToKnowPace.label": "Pace of getting to know",
  "profile.intelligence.q.gettingToKnowPace.question":
    "What pace feels comfortable to you when getting to know a potential match?",
  "profile.intelligence.q.gettingToKnowPace.questionForChild":
    "What pace do they find comfortable when getting to know someone?",
  "profile.intelligence.q.gettingToKnowPace.why":
    "A mismatch in pace causes more misunderstanding than anything else — one side reads it as no interest, the other as being rushed.",

  /* ---------------------------------------------------------------- */
  /* Questions — Life after marriage                                   */
  /* ---------------------------------------------------------------- */

  "profile.intelligence.q.postMarriageLivingPlan.label": "Where you'll live",
  "profile.intelligence.q.postMarriageLivingPlan.question":
    "What's your preference for living arrangements after marriage?",
  "profile.intelligence.q.postMarriageLivingPlan.questionForChild":
    "What living arrangement are they thinking about after marriage?",
  "profile.intelligence.q.postMarriageLivingPlan.why":
    "This is the biggest practical decision in India. Knowing it before a match saves both sides time.",

  "profile.intelligence.q.parentCareExpectation.label": "Caring for parents",
  "profile.intelligence.q.parentCareExpectation.question":
    "How do you see caring for and supporting parents in the future?",
  "profile.intelligence.q.parentCareExpectation.questionForChild":
    "How do they see caring for and supporting parents?",
  "profile.intelligence.q.parentCareExpectation.why":
    "Two years into a marriage this matters more than almost anything — better settled early.",

  "profile.intelligence.q.familyInvolvementLevel.label": "Family involvement",
  "profile.intelligence.q.familyInvolvementLevel.question":
    "How much extended-family involvement feels comfortable after marriage?",
  "profile.intelligence.q.familyInvolvementLevel.questionForChild":
    "How much extended-family involvement feels comfortable to them?",
  "profile.intelligence.q.familyInvolvementLevel.why":
    "How close family stays — when two people see this differently, it shows up in daily life.",

  "profile.intelligence.q.householdDecisionStyle.label": "Big decisions",
  "profile.intelligence.q.householdDecisionStyle.question":
    "How should the big decisions at home be made?",
  "profile.intelligence.q.householdDecisionStyle.questionForChild":
    "How should the big decisions at home be made?",
  "profile.intelligence.q.householdDecisionStyle.why":
    "Who makes the decisions is what sets the everyday peace of a marriage.",

  "profile.intelligence.q.householdResponsibilityStyle.label": "Housework",
  "profile.intelligence.q.householdResponsibilityStyle.question":
    "How do you think daily household responsibilities should be handled?",
  "profile.intelligence.q.householdResponsibilityStyle.questionForChild":
    "How should daily household responsibilities be handled?",
  "profile.intelligence.q.householdResponsibilityStyle.why":
    "How the housework gets divided — mismatched expectations here wear people down daily.",

  /* ---------------------------------------------------------------- */
  /* Questions — Career and city                                       */
  /* ---------------------------------------------------------------- */

  "profile.intelligence.q.careerPriority.label": "Career priority",
  "profile.intelligence.q.careerPriority.question": "How important is your career in your life?",
  "profile.intelligence.q.careerPriority.questionForChild": "How important is their career to them?",
  "profile.intelligence.q.careerPriority.why":
    "When career priorities match, two people can actually understand each other's work.",

  "profile.intelligence.q.relocationBoundary.label": "Relocation",
  "profile.intelligence.q.relocationBoundary.question": "How far can you relocate for marriage?",
  "profile.intelligence.q.relocationBoundary.questionForChild":
    "How far can they relocate for marriage?",
  "profile.intelligence.q.relocationBoundary.why":
    "A plain yes or no isn't enough — how far is the real question.",

  "profile.intelligence.q.partnerCareerExpectation.label": "Partner's career",
  "profile.intelligence.q.partnerCareerExpectation.question":
    "What do you expect when it comes to your partner's career?",
  "profile.intelligence.q.partnerCareerExpectation.questionForChild":
    "What do they expect when it comes to their partner's career?",
  "profile.intelligence.q.partnerCareerExpectation.why":
    "This matters more as time goes on — better to be clear about it upfront.",

  "profile.intelligence.q.careerBreakExpectation.label": "Career break",
  "profile.intelligence.q.careerBreakExpectation.question":
    "How do you view a future career break for children or family?",
  "profile.intelligence.q.careerBreakExpectation.questionForChild":
    "How do they view a career break for family?",
  "profile.intelligence.q.careerBreakExpectation.why":
    "This is the thing that surfaces suddenly after marriage — asking now is the more honest option.",

  "profile.intelligence.q.workIntensityAcceptance.label": "Work pressure",
  "profile.intelligence.q.workIntensityAcceptance.question":
    "How would you feel about a partner with long hours or heavy travel?",
  "profile.intelligence.q.workIntensityAcceptance.questionForChild":
    "How would they feel about a partner with long hours or heavy travel?",
  "profile.intelligence.q.workIntensityAcceptance.why":
    "A partner's schedule shapes your daily life — this is not a small thing.",

  /* ---------------------------------------------------------------- */
  /* Questions — Money                                                 */
  /* ---------------------------------------------------------------- */

  "profile.intelligence.q.moneyStyle.label": "Money habits",
  "profile.intelligence.q.moneyStyle.question": "How do you naturally handle money?",
  "profile.intelligence.q.moneyStyle.questionForChild": "How do they naturally handle money?",
  "profile.intelligence.q.moneyStyle.why":
    "Money habits show up every day — when they match, a lot falls into place on its own.",

  "profile.intelligence.q.postMarriageFinanceStyle.label": "Money after marriage",
  "profile.intelligence.q.postMarriageFinanceStyle.question":
    "How would you be comfortable managing finances after marriage?",
  "profile.intelligence.q.postMarriageFinanceStyle.questionForChild":
    "How should finances be managed after marriage?",
  "profile.intelligence.q.postMarriageFinanceStyle.why":
    "Joint or separate — agreeing on this early is what keeps the tension away later.",

  "profile.intelligence.q.familyFinancialSupport.label": "Family support",
  "profile.intelligence.q.familyFinancialSupport.question":
    "Do you have a regular financial responsibility towards your family?",
  "profile.intelligence.q.familyFinancialSupport.questionForChild":
    "Is there a regular financial responsibility towards family?",
  "profile.intelligence.q.familyFinancialSupport.why":
    "The amount is never asked — only whether the responsibility exists.",

  "profile.intelligence.q.debtObligation.label": "Financial commitment",
  "profile.intelligence.q.debtObligation.question":
    "Do you currently have any major financial commitment?",
  "profile.intelligence.q.debtObligation.questionForChild":
    "Is there any major financial commitment?",
  "profile.intelligence.q.debtObligation.why":
    "The amount is never asked. This is only for your own record.",

  "profile.intelligence.q.bigPurchaseDecision.label": "Big spending",
  "profile.intelligence.q.bigPurchaseDecision.question":
    "How should a big expense — a house, a car, an investment — be decided?",
  "profile.intelligence.q.bigPurchaseDecision.questionForChild":
    "How should a big expense be decided?",
  "profile.intelligence.q.bigPurchaseDecision.why":
    "Who gets a say on big spending tells you a lot about how decisions get made.",

  /* ---------------------------------------------------------------- */
  /* Questions — Children and parenting                                */
  /* ---------------------------------------------------------------- */

  "profile.intelligence.q.childrenPreference.label": "Children",
  "profile.intelligence.q.childrenPreference.question":
    "What do you think about having children in the future?",
  "profile.intelligence.q.childrenPreference.questionForChild":
    "What do they think about having children in the future?",
  "profile.intelligence.q.childrenPreference.why":
    "A mismatch on this one thing is what breaks marriages later. This answer never appears on your public profile.",

  "profile.intelligence.q.childrenTimeline.label": "Family planning",
  "profile.intelligence.q.childrenTimeline.question":
    "How long after marriage would you be comfortable planning a family?",
  "profile.intelligence.q.childrenTimeline.questionForChild":
    "How long after marriage would planning a family feel right?",
  "profile.intelligence.q.childrenTimeline.why":
    "A gap in timing causes more friction later than almost anything else.",

  "profile.intelligence.q.parentingResponsibility.label": "Sharing parenting",
  "profile.intelligence.q.parentingResponsibility.question":
    "How should parenting responsibilities be shared?",
  "profile.intelligence.q.parentingResponsibility.questionForChild":
    "How should parenting responsibilities be shared?",
  "profile.intelligence.q.parentingResponsibility.why":
    "How the load gets divided once children arrive — asking first is the honest thing to do.",

  "profile.intelligence.q.parentingStyle.label": "Parenting style",
  "profile.intelligence.q.parentingStyle.question":
    "Which way does your parenting style naturally lean?",
  "profile.intelligence.q.parentingStyle.questionForChild":
    "Which way does their parenting style lean?",
  "profile.intelligence.q.parentingStyle.why":
    "When you think about raising children the same way, there is a lot less arguing at home.",

  /* ---------------------------------------------------------------- */
  /* Questions — Everyday life                                         */
  /* ---------------------------------------------------------------- */

  "profile.intelligence.q.sleepRhythm.label": "Routine",
  "profile.intelligence.q.sleepRhythm.question": "What is your normal routine like?",
  "profile.intelligence.q.sleepRhythm.questionForChild": "What is their normal routine like?",
  "profile.intelligence.q.sleepRhythm.why":
    "Two different routines under one roof — a small thing you feel every single day.",

  "profile.intelligence.q.fitnessImportance.label": "Fitness",
  "profile.intelligence.q.fitnessImportance.question":
    "How important is a fitness or health routine to you?",
  "profile.intelligence.q.fitnessImportance.questionForChild":
    "How important is a fitness or health routine to them?",
  "profile.intelligence.q.fitnessImportance.why":
    "Shared health habits make spending time together much easier.",

  "profile.intelligence.q.travelStyle.label": "Travel",
  "profile.intelligence.q.travelStyle.question": "How do you feel about travel?",
  "profile.intelligence.q.travelStyle.questionForChild": "How do they feel about travel?",
  "profile.intelligence.q.travelStyle.why":
    "How holidays get spent — agreeing on this keeps life easy.",

  "profile.intelligence.q.petsPreference.label": "Pets",
  "profile.intelligence.q.petsPreference.question": "Are you comfortable with pets?",
  "profile.intelligence.q.petsPreference.questionForChild": "Are they comfortable with pets?",
  "profile.intelligence.q.petsPreference.why":
    "It sounds minor, but under one roof it becomes an everyday matter.",

  /* ---------------------------------------------------------------- */
  /* Questions — Talking and the relationship                          */
  /* ---------------------------------------------------------------- */

  "profile.intelligence.q.conflictFirstResponse.label": "After an argument",
  "profile.intelligence.q.conflictFirstResponse.question":
    "Your partner is upset and doesn't want to talk right away — what would you usually do?",
  "profile.intelligence.q.conflictFirstResponse.questionForChild":
    "What do they usually do in a situation like that?",
  "profile.intelligence.q.conflictFirstResponse.why":
    "The first move after an argument — there is no better signal of compatibility than this.",

  "profile.intelligence.q.disagreementStyle.label": "Disagreements",
  "profile.intelligence.q.disagreementStyle.question":
    "What if the two of you disagree about something important?",
  "profile.intelligence.q.disagreementStyle.questionForChild":
    "What do they do when there is a disagreement about something important?",
  "profile.intelligence.q.disagreementStyle.why":
    "How disagreements get resolved is what a relationship actually rests on.",

  "profile.intelligence.q.communicationFrequency.label": "How much talking",
  "profile.intelligence.q.communicationFrequency.question":
    "How important is daily communication in a relationship?",
  "profile.intelligence.q.communicationFrequency.questionForChild":
    "How important is daily communication to them?",
  "profile.intelligence.q.communicationFrequency.why":
    "One person needs to talk every day and the other doesn't — this mismatch is very common.",

  "profile.intelligence.q.personalSpace.label": "Personal space",
  "profile.intelligence.q.personalSpace.question":
    "What do you prefer when it comes to personal space?",
  "profile.intelligence.q.personalSpace.questionForChild":
    "What do they prefer when it comes to personal space?",
  "profile.intelligence.q.personalSpace.why":
    "How much time you need to yourself is something you feel every day.",

  "profile.intelligence.q.careStyle.label": "How you show care",
  "profile.intelligence.q.careStyle.question": "How do you mostly express care?",
  "profile.intelligence.q.careStyle.questionForChild": "How do they express care?",
  "profile.intelligence.q.careStyle.why":
    "When two people show affection in different ways, both end up feeling unnoticed.",

  "profile.intelligence.q.privacyBoundary.label": "Private matters",
  "profile.intelligence.q.privacyBoundary.question":
    "How do you feel about sharing personal matters from your relationship with family or friends?",
  "profile.intelligence.q.privacyBoundary.questionForChild":
    "How do they feel about sharing personal matters with family or friends?",
  "profile.intelligence.q.privacyBoundary.why":
    "Whether what happens at home stays at home — you need to agree on this one.",

  /* ---------------------------------------------------------------- */
  /* Questions — Values and tradition                                  */
  /* ---------------------------------------------------------------- */

  "profile.intelligence.q.religiousPracticeLevel.label": "Religious practice",
  "profile.intelligence.q.religiousPracticeLevel.question":
    "How important is religion or religious practice in your daily life?",
  "profile.intelligence.q.religiousPracticeLevel.questionForChild":
    "How important is religion or practice in their daily life?",
  "profile.intelligence.q.religiousPracticeLevel.why":
    "This never decides your matches on its own — it counts only when you make it your own stated preference.",

  "profile.intelligence.q.ritualImportance.label": "Rituals",
  "profile.intelligence.q.ritualImportance.question":
    "How important is it to you to follow festivals, rituals and traditions?",
  "profile.intelligence.q.ritualImportance.questionForChild":
    "How important is it to follow festivals and traditions?",
  "profile.intelligence.q.ritualImportance.why":
    "How festivals are kept is the everyday colour of a home.",

  "profile.intelligence.q.traditionModernBalance.label": "Tradition vs modern",
  "profile.intelligence.q.traditionModernBalance.question":
    "What balance do you prefer in married life?",
  "profile.intelligence.q.traditionModernBalance.questionForChild":
    "What balance do they prefer in married life?",
  "profile.intelligence.q.traditionModernBalance.why":
    "This gives a far clearer picture than the old Traditional/Modern choice ever did.",

  "profile.intelligence.q.interCommunityOpenness.label": "Community openness",
  "profile.intelligence.q.interCommunityOpenness.question":
    "How open are you to a match from a different caste or community background?",
  "profile.intelligence.q.interCommunityOpenness.questionForChild":
    "How open are they to a match from a different caste or community?",
  "profile.intelligence.q.interCommunityOpenness.why":
    "This is only your own stated preference. It attaches nothing to anyone else's caste and never enters the matching model.",

  /* ---------------------------------------------------------------- */
  /* Questions — What you want in a partner                            */
  /* ---------------------------------------------------------------- */

  /* The count in the next two lines is `MAX_DEAL_BREAKERS`, interpolated into
     the source string. Change that constant and this copy needs the same edit —
     the coverage check compares keys, not numbers. */
  "profile.intelligence.q.dealBreakerCodes.label": "Non-negotiables",
  "profile.intelligence.q.dealBreakerCodes.question": "Pick up to 5 non-negotiables.",
  "profile.intelligence.q.dealBreakerCodes.questionForChild": "Pick up to 5 non-negotiables.",
  "profile.intelligence.q.dealBreakerCodes.why":
    "The things you genuinely cannot accept — this is what keeps those profiles from coming up at all.",

  /* The ten importance questions share one explanation, by design. */
  "profile.intelligence.q.importance:age.label": "Age",
  "profile.intelligence.q.importance:age.question":
    "Your partner's age range — how important is this to you?",
  "profile.intelligence.q.importance:age.questionForChild":
    "Your partner's age range — how important is this?",
  "profile.intelligence.q.importance:city.label": "City",
  "profile.intelligence.q.importance:city.question":
    "Your partner's city — how important is this to you?",
  "profile.intelligence.q.importance:city.questionForChild":
    "Your partner's city — how important is this?",
  "profile.intelligence.q.importance:education.label": "Education",
  "profile.intelligence.q.importance:education.question":
    "Your partner's education — how important is this to you?",
  "profile.intelligence.q.importance:education.questionForChild":
    "Your partner's education — how important is this?",
  "profile.intelligence.q.importance:children.label": "Children",
  "profile.intelligence.q.importance:children.question":
    "Seeing children the same way — how important is this to you?",
  "profile.intelligence.q.importance:children.questionForChild":
    "Seeing children the same way — how important is this?",
  "profile.intelligence.q.importance:living.label": "Living arrangement",
  "profile.intelligence.q.importance:living.question":
    "The living arrangement after marriage — how important is this to you?",
  "profile.intelligence.q.importance:living.questionForChild":
    "The living arrangement after marriage — how important is this?",
  "profile.intelligence.q.importance:relocation.label": "Relocation",
  "profile.intelligence.q.importance:relocation.question":
    "Their position on relocation — how important is this to you?",
  "profile.intelligence.q.importance:relocation.questionForChild":
    "Their position on relocation — how important is this?",
  "profile.intelligence.q.importance:partnerCareer.label": "Partner career",
  "profile.intelligence.q.importance:partnerCareer.question":
    "Your expectation about your partner's career — how important is this to you?",
  "profile.intelligence.q.importance:partnerCareer.questionForChild":
    "Your expectation about your partner's career — how important is this?",
  "profile.intelligence.q.importance:religion.label": "Religion",
  "profile.intelligence.q.importance:religion.question":
    "Your partner's religion — how important is this to you?",
  "profile.intelligence.q.importance:religion.questionForChild":
    "Your partner's religion — how important is this?",
  "profile.intelligence.q.importance:caste.label": "Community",
  "profile.intelligence.q.importance:caste.question":
    "Your partner's caste or community — how important is this to you?",
  "profile.intelligence.q.importance:caste.questionForChild":
    "Your partner's caste or community — how important is this?",
  "profile.intelligence.q.importance:manglik.label": "Manglik",
  "profile.intelligence.q.importance:manglik.question":
    "Manglik status — how important is this to you?",
  "profile.intelligence.q.importance:manglik.questionForChild":
    "Manglik status — how important is this?",

  /* Same sentence for all ten — the question differs, the reason does not. */
  "profile.intelligence.q.importance:age.why":
    "This sets how much weight the answer carries in ranking. Must match counts for more, Flexible for less.",
  "profile.intelligence.q.importance:city.why":
    "This sets how much weight the answer carries in ranking. Must match counts for more, Flexible for less.",
  "profile.intelligence.q.importance:education.why":
    "This sets how much weight the answer carries in ranking. Must match counts for more, Flexible for less.",
  "profile.intelligence.q.importance:children.why":
    "This sets how much weight the answer carries in ranking. Must match counts for more, Flexible for less.",
  "profile.intelligence.q.importance:living.why":
    "This sets how much weight the answer carries in ranking. Must match counts for more, Flexible for less.",
  "profile.intelligence.q.importance:relocation.why":
    "This sets how much weight the answer carries in ranking. Must match counts for more, Flexible for less.",
  "profile.intelligence.q.importance:partnerCareer.why":
    "This sets how much weight the answer carries in ranking. Must match counts for more, Flexible for less.",
  "profile.intelligence.q.importance:religion.why":
    "This sets how much weight the answer carries in ranking. Must match counts for more, Flexible for less.",
  "profile.intelligence.q.importance:caste.why":
    "This sets how much weight the answer carries in ranking. Must match counts for more, Flexible for less.",
  "profile.intelligence.q.importance:manglik.why":
    "This sets how much weight the answer carries in ranking. Must match counts for more, Flexible for less.",

  /* ---------------------------------------------------------------- */
  /* Option labels                                                     */
  /*                                                                   */
  /* Keyed by the option string itself, so an answer written once here  */
  /* serves every question that offers it. The key half is the STORED   */
  /* value and must never change; only the value half is English.       */
  /* ---------------------------------------------------------------- */

  "profile.intelligence.option.0–3 months": "0–3 months",
  "profile.intelligence.option.3–6 months": "3–6 months",
  "profile.intelligence.option.6–12 months": "6–12 months",
  "profile.intelligence.option.1–2 years": "1–2 years",
  "profile.intelligence.option.3+ years": "3+ years",
  "profile.intelligence.option.Abhi sure nahi": "Not sure yet",
  "profile.intelligence.option.Family talks ke liye ready hoon": "Ready for family conversations",
  "profile.intelligence.option.Pehle person ko achhe se samajhna chahta/chahti hoon":
    "I want to know the person properly first",
  "profile.intelligence.option.Seriously explore kar raha/rahi hoon, jaldi nahi hai":
    "Exploring seriously, but not in a hurry",
  "profile.intelligence.option.Shuru se": "From the start",
  "profile.intelligence.option.2–3 conversations ke baad": "After 2–3 conversations",
  "profile.intelligence.option.Mutual interest ke baad": "Once there is mutual interest",
  "profile.intelligence.option.Jab rishta serious lage": "When it starts feeling serious",
  "profile.intelligence.option.Main primarily decide karunga/karungi": "Mostly my own decision",
  "profile.intelligence.option.Main aur family equally": "Me and my family equally",
  "profile.intelligence.option.Family ki strong involvement hogi": "Family will be strongly involved",
  "profile.intelligence.option.Mostly family-led": "Mostly family-led",
  "profile.intelligence.option.Fast — jaldi clarity": "Fast — clarity quickly",
  "profile.intelligence.option.Balanced": "Balanced",
  "profile.intelligence.option.Time lekar": "Take it slowly",
  "profile.intelligence.option.Situation par depend": "Depends on the situation",
  "profile.intelligence.option.Situation based": "Depends on the situation",
  "profile.intelligence.option.Situation ke hisaab se": "Depends on the situation",
  "profile.intelligence.option.Depends": "Depends",
  "profile.intelligence.option.Joint family": "Joint family",
  "profile.intelligence.option.Parents ke paas, lekin separate home": "Near parents, but our own home",
  "profile.intelligence.option.Nuclear family": "Nuclear family",
  "profile.intelligence.option.Flexible": "Flexible",
  "profile.intelligence.option.Partner ke saath decide karenge": "Will decide with my partner",
  "profile.intelligence.option.Partner ke saath decide": "Decide with my partner",
  "profile.intelligence.option.Partner ke saath milkar decide karenge":
    "Will decide together with my partner",
  "profile.intelligence.option.Daily life me actively involved rehna important hai":
    "Being actively involved day to day matters",
  "profile.intelligence.option.Financial/support responsibility important hai":
    "Financial and support responsibility matters",
  "profile.intelligence.option.Siblings ke saath shared responsibility":
    "Shared responsibility with siblings",
  "profile.intelligence.option.Bahut close/involved": "Very close and involved",
  "profile.intelligence.option.Regular, lekin boundaries ke saath": "Regular, but with boundaries",
  "profile.intelligence.option.Moderate": "Moderate",
  "profile.intelligence.option.Mostly couple-led life": "Mostly a couple-led life",
  "profile.intelligence.option.Couple pehle decide kare": "The couple decides first",
  "profile.intelligence.option.Couple + family milkar": "The couple and family together",
  "profile.intelligence.option.Family matters me elders ki strong role ho":
    "Elders take a strong role in family matters",
  "profile.intelligence.option.Decision ke type par depend": "Depends on the kind of decision",
  "profile.intelligence.option.Equal sharing": "Equal sharing",
  "profile.intelligence.option.Jiske paas time ho woh kare": "Whoever has the time does it",
  "profile.intelligence.option.Roles divide karna better hai": "Better to divide the roles",
  "profile.intelligence.option.Domestic help + shared responsibility":
    "Domestic help plus shared responsibility",
  "profile.intelligence.option.Top priority": "Top priority",
  "profile.intelligence.option.Bahut important": "Very important",
  "profile.intelligence.option.Balanced with family": "Balanced with family",
  "profile.intelligence.option.Same city/nearby only": "Same city or nearby only",
  "profile.intelligence.option.Selected cities": "Selected cities",
  "profile.intelligence.option.Anywhere in India": "Anywhere in India",
  "profile.intelligence.option.International bhi": "Abroad as well",
  "profile.intelligence.option.Relocate nahi kar sakta/sakti": "Cannot relocate",
  "profile.intelligence.option.Right person ho to discuss kar sakte hain":
    "Open to discussing it for the right person",
  "profile.intelligence.option.Career continue karna important hai":
    "It matters that they keep working",
  "profile.intelligence.option.Continue kare to accha hai": "Good if they continue",
  "profile.intelligence.option.Unki choice": "Entirely their choice",
  "profile.intelligence.option.Family situation ke hisaab se": "Depends on the family situation",
  "profile.intelligence.option.Prefer home-focused": "Prefer home-focused",
  "profile.intelligence.option.Discuss together": "Discuss together",
  "profile.intelligence.option.Dono me se koi situation ke hisaab se":
    "Either of us, depending on the situation",
  "profile.intelligence.option.Career break avoid karna chahiye": "A career break should be avoided",
  "profile.intelligence.option.Temporary break okay hai": "A temporary break is fine",
  "profile.intelligence.option.Family role ke hisaab se decide": "Decide based on family roles",
  "profile.intelligence.option.Abhi discuss nahi kiya": "Haven't discussed it yet",
  "profile.intelligence.option.Bilkul okay": "Completely fine",
  "profile.intelligence.option.Occasionally okay": "Occasionally fine",
  "profile.intelligence.option.Work-life balance important": "Work-life balance matters",
  "profile.intelligence.option.Prefer predictable schedule": "Prefer a predictable schedule",
  "profile.intelligence.option.Saver": "Saver",
  "profile.intelligence.option.Save + enjoy balanced": "Balance saving and enjoying",
  "profile.intelligence.option.Investor mindset": "Investor mindset",
  "profile.intelligence.option.Experiences par spend karna pasand": "Like spending on experiences",
  "profile.intelligence.option.Mostly joint": "Mostly joint",
  "profile.intelligence.option.Joint expenses + separate savings": "Joint expenses, separate savings",
  "profile.intelligence.option.Mostly separate": "Mostly separate",
  "profile.intelligence.option.Income ke proportion me contribution":
    "Contribute in proportion to income",
  "profile.intelligence.option.Nahi": "No",
  "profile.intelligence.option.Kabhi-kabhi": "Occasionally",
  "profile.intelligence.option.Regular support": "Regular support",
  "profile.intelligence.option.Significant responsibility": "Significant responsibility",
  "profile.intelligence.option.Private rakhna chahta/chahti hoon": "I'd rather keep this private",
  "profile.intelligence.option.None": "None",
  "profile.intelligence.option.Home loan": "Home loan",
  "profile.intelligence.option.Education loan": "Education loan",
  "profile.intelligence.option.Business commitment": "Business commitment",
  "profile.intelligence.option.Other major loan": "Other major loan",
  "profile.intelligence.option.Serious stage par discuss karunga/karungi":
    "I'll discuss it at a serious stage",
  "profile.intelligence.option.Dono milkar": "Both together",
  "profile.intelligence.option.Jo financially lead kare": "Whoever leads financially",
  "profile.intelligence.option.Individual freedom + large expenses jointly":
    "Individual freedom, large expenses jointly",
  "profile.intelligence.option.Definitely yes": "Definitely yes",
  "profile.intelligence.option.Probably yes": "Probably yes",
  "profile.intelligence.option.Unsure": "Unsure",
  "profile.intelligence.option.No": "No",
  "profile.intelligence.option.Jaldi": "Soon",
  "profile.intelligence.option.No fixed timeline": "No fixed timeline",
  "profile.intelligence.option.Equal involvement": "Equal involvement",
  "profile.intelligence.option.Work situation ke hisaab se": "Depends on the work situation",
  "profile.intelligence.option.One parent primary role le sakta hai":
    "One parent can take the primary role",
  "profile.intelligence.option.Extended family support ke saath": "With extended-family support",
  "profile.intelligence.option.Discuss later": "Discuss later",
  "profile.intelligence.option.Traditional": "Traditional",
  "profile.intelligence.option.Progressive": "Progressive",
  "profile.intelligence.option.Early morning person": "Early morning person",
  "profile.intelligence.option.Late-night person": "Late-night person",
  "profile.intelligence.option.Normal office-style routine": "Normal office-style routine",
  "profile.intelligence.option.Routine flexible hai": "My routine is flexible",
  "profile.intelligence.option.Daily life ka important part": "An important part of daily life",
  "profile.intelligence.option.Regularly try karta/karti hoon": "I try to keep it up",
  "profile.intelligence.option.Occasionally": "Occasionally",
  "profile.intelligence.option.Priority nahi": "Not a priority",
  "profile.intelligence.option.Frequent traveller": "Frequent traveller",
  "profile.intelligence.option.Saalaana kuch trips": "A few trips a year",
  "profile.intelligence.option.Home/local life prefer": "Prefer home and local life",
  "profile.intelligence.option.Love pets": "Love pets",
  "profile.intelligence.option.Okay with pets": "Okay with pets",
  "profile.intelligence.option.Prefer no pets": "Prefer no pets",
  "profile.intelligence.option.Thoda space dunga/dungi": "Give them some space",
  "profile.intelligence.option.Turant calmly baat karna prefer":
    "Prefer to talk it through calmly right away",
  "profile.intelligence.option.Message karke baad me baat": "Message now, talk later",
  "profile.intelligence.option.Baat karke middle ground": "Talk it through to a middle ground",
  "profile.intelligence.option.Facts/pros-cons dekhna": "Look at the facts and the pros and cons",
  "profile.intelligence.option.Thoda time lekar revisit": "Take some time, then come back to it",
  "profile.intelligence.option.Trusted person/family advice": "Ask a trusted person or family",
  "profile.intelligence.option.Regular contact, but not constant": "Regular contact, but not constant",
  "profile.intelligence.option.Quality matters more than frequency":
    "Quality matters more than frequency",
  "profile.intelligence.option.Routine ke hisaab se": "Depends on the routine",
  "profile.intelligence.option.Individual time bahut important": "Time to myself matters a lot",
  "profile.intelligence.option.Balanced together + personal time":
    "A balance of together and personal time",
  "profile.intelligence.option.Most things together karna pasand":
    "I like doing most things together",
  "profile.intelligence.option.Baat karke/reassurance": "Words and reassurance",
  "profile.intelligence.option.Time dekar": "Giving time",
  "profile.intelligence.option.Practical help/actions": "Practical help and actions",
  "profile.intelligence.option.Small gestures/gifts": "Small gestures and gifts",
  "profile.intelligence.option.Mix": "A mix",
  "profile.intelligence.option.Mostly private": "Mostly private",
  "profile.intelligence.option.Important things trusted family se share":
    "Share important things with trusted family",
  "profile.intelligence.option.Close family involvement comfortable":
    "Comfortable with close family being involved",
  "profile.intelligence.option.Very important": "Very important",
  "profile.intelligence.option.Moderately important": "Moderately important",
  "profile.intelligence.option.Occasional": "Occasional",
  "profile.intelligence.option.Cultural more than religious": "Cultural more than religious",
  "profile.intelligence.option.Not important": "Not important",
  "profile.intelligence.option.Prefer not to answer": "Prefer not to answer",
  "profile.intelligence.option.Strongly important": "Strongly important",
  "profile.intelligence.option.Important selected traditions": "Some traditions matter",
  "profile.intelligence.option.Not particularly important": "Not particularly important",
  "profile.intelligence.option.Mostly traditional": "Mostly traditional",
  "profile.intelligence.option.Traditional with modern flexibility":
    "Traditional, with modern flexibility",
  "profile.intelligence.option.Mostly modern": "Mostly modern",
  "profile.intelligence.option.Depends on issue": "Depends on the issue",
  "profile.intelligence.option.Completely open": "Completely open",
  "profile.intelligence.option.Preference hai but flexible": "I have a preference, but I'm flexible",
  "profile.intelligence.option.Same community strongly prefer": "Strongly prefer the same community",
  "profile.intelligence.option.Family ke saath discuss hoga": "Will be discussed with family",

  /* Deal-breaker options are codes; the label already comes from
     DEAL_BREAKER_LABEL and is English in both locales. Listed so the coverage
     check has no exceptions to carry. */
  "profile.intelligence.option.NO_SMOKING": "Smoking",
  "profile.intelligence.option.NO_DRINKING": "Drinking",
  "profile.intelligence.option.CHILDREN_MISMATCH": "Children preference",
  "profile.intelligence.option.NO_RELOCATION": "Relocation",
  "profile.intelligence.option.CAREER_CONTINUATION": "Career continuation",
  "profile.intelligence.option.LIVING_ARRANGEMENT": "Living arrangement",
  "profile.intelligence.option.RELIGION": "Religion",
  "profile.intelligence.option.COMMUNITY": "Community",
  "profile.intelligence.option.DIET": "Diet",
  "profile.intelligence.option.FAMILY_INVOLVEMENT": "Family involvement",

  "profile.intelligence.option.Must match": "Must match",
  "profile.intelligence.option.Strong preference": "Strong preference",
};

export default profileCatalog;
