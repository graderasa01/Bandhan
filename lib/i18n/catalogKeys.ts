/**
 * Dictionary keys for copy that lives in a data catalog rather than at a call
 * site.
 *
 * Ordinary components write `t("profile.overviewCard.title", "Aapki Profile")`
 * — key and Hinglish source side by side, which is the whole reason
 * `translate.ts` takes a fallback. That does not work for
 * `FIELD_CATEGORIES`, `INTELLIGENCE_LAYERS` and `INTELLIGENCE_QUESTIONS`: the
 * copy is one field of a record the renderer receives, so the key has to be
 * *derived* from that record's id. These builders are that derivation, in one
 * place, so a screen cannot invent a second spelling of the same key.
 *
 * ## The catalog is not translated — the render is
 *
 * Nothing here changes `intelligenceQuestions.ts` or `fieldGroups.ts`. Those
 * files stay the single source of what is asked, in the source language, and
 * every seam that feeds AI, matching or storage keeps reading them untouched.
 * A locale only ever changes what a component prints:
 *
 *     t(catalogKey.questionText(q.key), q.question)
 *
 * — key for the translation, catalog string as the fallback, exactly like a
 * hand-written call site.
 *
 * ## Why option keys are the option string itself
 *
 * An option is also the stored value, the matching key and the thing
 * `saveSignalAnswer` validates against (see `intelligenceQuestions.ts`'s
 * header). So the *value* can never be localised — only its label. Keying that
 * label by the raw option text rather than by `question + index` buys two
 * things: the same answer written once instead of 49 times ("Abhi sure nahi"
 * appears in four questions, "Flexible" in thirteen), and immunity to someone
 * reordering a question's options, which would silently re-point every
 * index-based key to the wrong label.
 *
 * Deal-breaker options are codes (`NO_SMOKING`), so their key is the code and
 * their fallback is `DEAL_BREAKER_LABEL`'s English — already correct in both
 * locales, and listed anyway so the coverage check has nothing to except.
 */

export const catalogKey = {
  /** `FIELD_CATEGORIES` — the dashboard's "Aapki Profile" sections. */
  categoryLabel: (key: string) => `profile.fieldCategory.${key}.label`,
  categoryHint: (key: string) => `profile.fieldCategory.${key}.hint`,

  /** `INTELLIGENCE_LAYERS` — the nine areas. */
  layerTitle: (key: string) => `profile.intelligence.layer.${key}.title`,
  layerUnlocks: (key: string) => `profile.intelligence.layer.${key}.unlocks`,
  /** A layer's `alreadyKnown` chip, keyed by the profile field it reads. */
  knownLabel: (field: string) => `profile.intelligence.known.${field}`,

  /** `INTELLIGENCE_QUESTIONS`. */
  questionLabel: (key: string) => `profile.intelligence.q.${key}.label`,
  questionText: (key: string) => `profile.intelligence.q.${key}.question`,
  questionForChild: (key: string) => `profile.intelligence.q.${key}.questionForChild`,
  questionWhy: (key: string) => `profile.intelligence.q.${key}.why`,

  /** Shared across every question that offers this option — see the header. */
  option: (value: string) => `profile.intelligence.option.${value}`,
} as const;
