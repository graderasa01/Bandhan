import nav from "./nav";
import publicPages from "./public";
import auth from "./auth";
import user from "./user";
import userComponents from "./userComponents";
import featureComponents from "./featureComponents";
import userPages from "./userPages";
import partner from "./partner";
import profile from "./profile";
import reel from "./reel";
import discovery from "./discovery";
import engagement from "./engagement";
import misc from "./misc";
import trustDemand from "./trustDemand";
import matchReel from "./matchReel";
import familyCircleKundli from "./familyCircleKundli";
import profileServices from "./profileServices";
import engagementServices from "./engagementServices";
import partnerSubscription from "./partnerSubscription";
import grioMap from "./grioMap";
import todayJourney from "./todayJourney";

/**
 * English copy, keyed by the ids used in `t("key", "Hinglish fallback")`.
 *
 * Split by area so unrelated screens are not edited in the same file. A key
 * missing from here is not an error: `t()` renders the inline Hinglish fallback,
 * so an untranslated string degrades to Hinglish rather than to a blank.
 */
const en: Record<string, string> = {
  ...nav,
  ...publicPages,
  ...auth,
  ...user,
  ...userComponents,
  ...featureComponents,
  ...userPages,
  ...partner,
  ...profile,
  ...reel,
  ...discovery,
  ...engagement,
  ...misc,
  ...trustDemand,
  ...matchReel,
  ...familyCircleKundli,
  ...profileServices,
  ...engagementServices,
  ...partnerSubscription,
  ...grioMap,
  ...todayJourney,
};

export default en;
