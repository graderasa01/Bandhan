/**
 * Human verification requests and badges (distinct from the automated
 * mobile/email OTP flow in verifyContact.*). components/admin/VerificationQueue.tsx,
 * components/verification/{MyVerificationRequests,VerificationBadgeList}.tsx,
 * app/admin/verification, app/user/verification, and the API routes under
 * app/api/admin/verification-checks and app/api/verification/requests.
 */
const verification: Record<string, string> = {};

export default verification;
