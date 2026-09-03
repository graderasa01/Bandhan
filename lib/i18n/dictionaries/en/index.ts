import nav from "./nav";
import publicPages from "./public";
import auth from "./auth";
import user from "./user";
import userComponents from "./userComponents";
import featureComponents from "./featureComponents";
import userPages from "./userPages";
import partner from "./partner";
import profile from "./profile";
import profileCatalog from "./profileCatalog";
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
import marketplacePartner from "./marketplacePartner";
import marketplacePublic from "./marketplacePublic";
import managedProfile from "./managedProfile";
import verification from "./verification";
import clientDesk from "./clientDesk";
import rishtaRoom from "./rishtaRoom";

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
  ...profileCatalog,
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
  ...marketplacePartner,
  ...marketplacePublic,
  ...managedProfile,
  ...verification,
  ...clientDesk,
  ...rishtaRoom,
};

export default en;
