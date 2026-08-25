/** Login, register, lock screen and the onboarding/interview flow. */
const auth: Record<string, string> = {
  // Shared across the auth screens
  "auth.divider.or": "or",
  "auth.error.network": "Network error — please try again.",
  "auth.error.generic": "Something went wrong — please try again.",

  // Login
  "login.title": "Login",
  "login.subtitle": "Log in to your account",
  "login.field.mobileOrEmail": "Mobile or Email",
  "login.field.password": "Password",
  "login.rememberMe": "Keep me signed in",
  "login.rememberMeHint": "Shared or someone else's phone? Turn this off.",
  "login.submit": "Log In",
  "login.error.failed": "Could not log you in.",
  "login.forgotPassword": "Forgot password?",
  "login.registerLink": "No account? Register",
  "login.partnerCta": "Are you a partner? Log in",
  "login.safetyNote": "Your login details are safe.",
  "login.googleError.failed": "Google login did not work. Please try again.",
  "login.googleError.state": "That login link had expired. Tap 'Continue with Google' again.",
  "login.googleError.unverified":
    "The email on this Google account is not verified, so you cannot log in. Verify it in Google and try again.",
  "login.googleError.unavailable":
    "Google login is not available right now. Please log in with mobile or email.",
  "login.googleError.accountBlocked": "This account is blocked. Please contact support.",

  // Forgot password
  "forgotPassword.title": "Forgot Password?",
  "forgotPassword.subtitle": "Enter your mobile or email — if there's an email on the account, we'll send a reset link there.",
  "forgotPassword.field.mobileOrEmail": "Mobile or Email",
  "forgotPassword.submit": "Send Reset Link",
  "forgotPassword.backToLogin": "Back to login",
  "forgotPassword.sentTitle": "Check your email",
  "forgotPassword.sentBody":
    "If that mobile or email belongs to an account, we've sent a reset link to its email. The link expires in 30 minutes.",

  // Reset password
  "resetPassword.title": "Set a New Password",
  "resetPassword.field.password": "New Password",
  "resetPassword.field.passwordHelp": "At least 8 characters",
  "resetPassword.field.confirmPassword": "Confirm Password",
  "resetPassword.error.mismatch": "Passwords do not match.",
  "resetPassword.error.failed": "Could not reset your password.",
  "resetPassword.submit": "Set Password",
  "resetPassword.doneTitle": "Password changed",
  "resetPassword.doneBody": "Log in with your new password — taking you to login now.",
  "resetPassword.missingTitle": "This link isn't right",
  "resetPassword.missingBody": "This reset link is incomplete. Request a fresh one from 'Forgot password'.",
  "resetPassword.requestNew": "Request a new link",

  // Register
  "register.title": "Create Free Account",
  "register.subtitle": "Start your verified marriage profile",
  "register.field.fullName": "Full Name",
  "register.field.mobile": "Mobile Number",
  "register.field.mobileHelp": "Or enter your email below",
  "register.field.email": "Email (optional)",
  "register.field.password": "Password",
  "register.field.passwordHelp": "At least 8 characters",
  "register.field.confirmPassword": "Confirm Password",
  "register.error.passwordMismatch": "Passwords do not match.",
  "register.error.failed": "Could not create your account.",
  "register.referral.referredYou": "referred you",
  "register.referral.privacyNote":
    "They will only see this: your first name, city, how complete your profile is, and whether you took a plan. Your profile, photos, matches and chats will never be shown to them.",
  "register.referral.unknownCode":
    "We do not recognise this referral code. You can still create your account.",
  "register.referral.message":
    "You are registering through a partner referral. A discount may apply.",
  "register.submit": "Create Free Profile",
  "register.loginLink": "Already have an account? Log in",
  "register.partnerCta": "Want to become a partner?",
  "register.partnerCtaDescription": "Refer people, earn commission.",
  "register.privacyNote": "Your data is safe.",

  // Lock screen (quick-unlock PIN)
  "lock.greeting": "Hello",
  "lock.subtitle": "Your chats and shortlist are private. Enter your 4-digit PIN to go ahead.",
  "lock.attemptsLeft": "tries left.",
  "lock.wrongPin": "Wrong PIN.",
  "lock.tooManyTries": "Too many wrong tries.",
  "lock.tryAgainAfter": "left before you can try again.",
  "lock.forgotPinHint":
    "Forgot your PIN? Log out and sign back in with your password — your data stays exactly as it is.",
  "lock.loggingOut": "Logging out…",
  "lock.forgotPin": "Forgot PIN?",

  // Screen lock PIN settings card
  "auth.pinStrength.FORMAT": "The PIN must be exactly 4 digits (0-9 only).",
  "auth.pinStrength.REPEATED": "All the digits cannot be the same — like 1111 or 0000.",
  "auth.pinStrength.SEQUENTIAL": "A straight run will not work — like 1234 or 4321.",
  "auth.pinSettings.title": "Screen lock PIN",
  "auth.pinSettings.toastOff": "Screen lock off",
  "auth.pinSettings.changePin": "Change PIN",
  "auth.pinSettings.turnOff": "Turn Off",
  "auth.pinSettings.setPin": "Set PIN",
  "auth.pinSettings.cancel": "Cancel",
  "auth.pinSettings.onDescription":
    "On — the app asks for your 4-digit PIN every time you open it. If someone at home picks up your phone, your chats and shortlist stay shut.",
  "auth.pinSettings.offDescription":
    "Do you share your phone at home? Set a 4-digit PIN — the app will ask for it every time you open it, so only you see your chats and shortlist. This is not your login, it is just a curtain on the screen.",
  "auth.pinSettings.installApp": "Install like an app",
  "auth.pinSettings.iosStep1Prefix": "Tap the",
  "auth.pinSettings.iosStep1Suffix": "button below",
  "auth.pinSettings.iosStep2Suffix": "— tap that",
  "auth.pinSettings.yourPin": "Your PIN",
  "auth.pinSettings.oldPin": "Old PIN",
  "auth.pinSettings.newPin": "New PIN",
  "auth.pinSettings.newPinAgain": "New PIN again",
  "auth.pinSettings.mismatch": "The two PINs are different — enter them again.",
  "auth.pinSettings.enterOldPin": "Enter your old PIN.",
  "auth.pinSettings.toastChanged": "PIN changed",
  "auth.pinSettings.toastOn": "Screen lock on — the app will ask for your PIN every time",
  "auth.pinSettings.rulesHint":
    "Same digits like 1111 and runs like 1234 will not work. If you forget your PIN, use “Forgot PIN?” on the lock screen to log out and come back with your password.",

  // Onboarding shell (profile building)
  "onboarding.stage1.title": "The basics",
  "onboarding.stage1.unlocks": "Your profile goes live",
  "onboarding.stage2.title": "Family and preferences",
  "onboarding.stage2.unlocks": "Daily matches start showing",
  "onboarding.stage3.title": "A little more personal",
  "onboarding.stage3.unlocks": "Chat opens up",
  "onboarding.stage4.title": "Photo and verification",
  "onboarding.stage4.unlocks": "Your trust score goes up",
  "onboarding.profileLive": "Your profile is live",
  "onboarding.done": "Done",
  "onboarding.later": "Later",
  "onboarding.draftSaved":
    "Your draft saves itself. Come back any time and carry on from here.",
  "onboarding.resetTitle": "Erase everything?",
  "onboarding.resetBody":
    "Everything you have filled in so far will go, and your profile starts from the beginning. This cannot be undone.",
  "onboarding.eraseAll": "Erase All & Start Over",
  "onboarding.resetCancel": "No, Keep It",
  "onboarding.resetConfirm": "Yes, Erase",
};

export default auth;
