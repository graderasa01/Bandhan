/**
 * English for `/bolo` — the spoken front door — and the OTP login it shares
 * a service with. Grio herself speaks whatever the visitor speaks (the model
 * follows the voice); these are only the words on the screen around her.
 */
const bolo: Record<string, string> = {
  "bolo.hero.eyebrow": "With Grio, 2 minutes",
  "bolo.hero.title": "Create your profile by talking",
  "bolo.hero.body":
    "No form, no password. Grio asks 8 short questions, the profile fills itself in — your number comes last.",
  "bolo.hero.start": "Start Talking",
  "bolo.hero.type": "Type Instead",
  "bolo.hero.biodata": "Upload Biodata",
  "bolo.hero.noMic": "Live voice does not work in this browser — type below or upload a biodata.",
  "bolo.hero.voiceOff": "Voice is off right now — type below or upload a biodata.",
  "bolo.hero.privacy": "What you say is only used to fill the profile — nobody sees it until you go live.",

  "bolo.who.self": "For myself",
  "bolo.who.son": "For my son",
  "bolo.who.daughter": "For my daughter",

  "bolo.status.connecting": "Grio is joining…",
  "bolo.status.listening": "Go ahead, I'm listening",
  "bolo.status.speaking": "Grio is speaking — you can interrupt",
  "bolo.status.tapToTalk": "Tap the mic and talk to Grio",
  "bolo.status.typeOnly": "Tell us by typing below",
  "bolo.voice.stop": "Stop",

  "bolo.card.title": "Your profile",
  "bolo.card.titleSon": "Your son's profile",
  "bolo.card.titleDaughter": "Your daughter's profile",
  "bolo.card.progress": "filled",
  "bolo.card.tapToFill": "Tap to fill",
  "bolo.card.edit": "Edit",
  "bolo.card.choose": "Choose",

  "bolo.review.confirm": "All Correct — Continue",
  "bolo.review.missing": "Still needed:",
  "bolo.review.saveDraft": "Save Draft & Create Account",

  "bolo.contact.title": "One number, and the profile is live",
  "bolo.contact.titleDraft": "Add a number and the draft is saved",
  "bolo.contact.subtitle": "This is how you log back in. No password needed.",
  "bolo.contact.accountName": "Your own name",
  "bolo.contact.accountNamePlaceholder": "e.g. Sunita Sharma",
  "bolo.contact.label": "Mobile number or email",
  "bolo.contact.help": "This is your login ID — the OTP comes here. No password needed.",
  "bolo.contact.helpNoOtp": "This is your login ID. You can add a password later in App Setup.",
  "bolo.contact.sendOtp": "Send OTP",
  "bolo.contact.goLive": "Make Profile Live",
  "bolo.contact.saveDraft": "Save Draft & Continue",
  "bolo.contact.otpUnavailable":
    "An OTP cannot be sent right now — the profile goes live without one. You can verify the number later.",
  "bolo.contact.codeSentTo": "Code sent to:",
  "bolo.contact.existing": "An account already uses this number — entering the code logs you into it.",
  "bolo.contact.code": "6-digit OTP",
  "bolo.contact.verify": "Verify & Go Live",
  "bolo.contact.resend": "Resend OTP",
  "bolo.contact.resendIn": "Resend in",
  "bolo.contact.verified": "confirmed",
  "bolo.contact.loginLink": "Go to the login page",

  "bolo.done.liveTitle": "Your profile is live 🎉",
  "bolo.done.liveBody": "Matches will start appearing now. You can add the rest later by talking.",
  "bolo.done.savedTitle": "Account created",
  "bolo.done.savedBody": "Your draft is saved — finish the remaining questions inside.",
  "bolo.done.passwordNote":
    "No password needed — this phone stays signed in. You can add a password in App Setup if you like.",
  "bolo.done.continue": "Continue",

  "bolo.typed.placeholder": 'Type: "Rahul Sharma, 12 May 1995, Jaipur, B.Tech, software engineer…"',
  "bolo.typed.placeholderLive": "Or type it here — Grio will read it",
  "bolo.typed.send": "Send",
  "bolo.typed.extract": "Read & Fill",

  "bolo.notice.idle": "No voice for a while — the conversation was paused. You can start again.",
  "bolo.notice.dropped": "The connection dropped. Everything filled so far is safe — start again or type.",
  "bolo.notice.maxSession": "One session's limit was reached. Everything filled so far is safe — start again.",
  "bolo.notice.nothingFound": "No profile details were found in that — write things like name, date of birth, city.",
  "bolo.notice.biodataRead": "From the biodata,",
  "bolo.notice.biodataFields": "details were found — please check them.",
  "bolo.notice.biodataEmpty": "The biodata did not contain the required details — tell us by voice or typing.",

  "bolo.fail.mic": "Microphone permission was not granted — type or upload a biodata, or allow the mic in your browser.",
  "bolo.fail.off": "Voice is not available right now — type or upload a biodata.",
  "bolo.fail.rate": "Too many attempts just now — try again in a little while, or type.",
  "bolo.fail.unsupported": "Live voice does not work in this browser — open it in Chrome or Safari, or type.",
  "bolo.fail.generic": "Could not connect to Grio — try again or type.",

  "bolo.error.otpSend": "The OTP could not be sent.",
  "bolo.error.otpWrong": "That code is wrong.",
  "bolo.error.exists": "An account already uses this number — please log in.",
  "bolo.error.complete": "The profile could not be saved. Please try once more.",
  "bolo.footer.haveAccount": "Already have an account?",
  "bolo.footer.login": "Log in",

  // OTP login (login page)
  "login.otp.tab": "OTP",
  "login.otp.passwordTab": "Password",
  "login.otp.contact": "Mobile number or email",
  "login.otp.send": "Send OTP",
  "login.otp.code": "6-digit OTP",
  "login.otp.verify": "Log in",
  "login.otp.resend": "Resend OTP",
  "login.otp.resendIn": "Resend in",
  "login.otp.sentTo": "Code sent to:",
  "login.otp.noAccount": "No account uses this number yet.",
  "login.otp.createOne": "Create one by talking",
  "login.otp.help": "No password needed — the code comes to your phone or inbox.",
  "login.otp.unavailable": "OTP login is not available right now — use your password.",
  "login.bolo.cta": "New here? Create your profile by talking — no password.",
};

export default bolo;
