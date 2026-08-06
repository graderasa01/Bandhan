/**
 * The invite a partner sends to someone who is not on BandhanTak yet.
 *
 * Separate from lib/partner/leadTemplates.ts on purpose. Those nudge a person
 * who already registered toward the next step; this one is a first contact
 * with a stranger, and it has a different job: say who is writing, say why
 * they have this number, and give one link. Mixing the two would mean one file
 * whose copy has to hedge about whether the reader has an account.
 *
 * Two rules the copy has to keep, both for the same reason — this arrives
 * unrequested:
 *
 * 1. **The partner's name comes first, not BandhanTak's.** The reader knows
 *    the pandit ji; they do not know us. A message that opens with our brand
 *    reads as spam, which is exactly what it would be without the partner.
 * 2. **Say plainly how they can make it stop.** Every message names the
 *    partner and tells the reader to reply if they aren't interested.
 *
 * Client-safe (no `server-only`, no Prisma): the invite page renders the
 * self-send text in the browser.
 */

export type InviteTemplateContext = {
  /** As the partner typed it. */
  fullName: string;
  partnerName: string;
  /** The full `/j/<token>` URL — personal to this invite. */
  inviteUrl: string;
};

/** First token only — "Namaste Priya ji" reads like a person wrote it; the full legal name does not. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "ji";
}

export function inviteWhatsApp(ctx: InviteTemplateContext): string {
  return (
    `Namaste ${firstName(ctx.fullName)} ji 🙏\n` +
    `Main ${ctx.partnerName}. Humari rishte ke baare me baat hui thi — maine aapke liye BandhanTak par jagah bana di hai.\n\n` +
    `Yahan verified profiles hain aur aapki details sirf aapke control me rehti hain. Neeche link se apni profile bana lijiye, main bhi yahin se aapke liye achhe rishte dekhta rahunga:\n` +
    `${ctx.inviteUrl}\n\n` +
    `Agar abhi interest nahi hai to bata dijiyega, main dobara message nahi karunga.\n` +
    `- ${ctx.partnerName}`
  );
}

export function inviteEmail(ctx: InviteTemplateContext): { subject: string; body: string } {
  return {
    subject: `${ctx.partnerName} ne aapko BandhanTak par invite kiya hai`,
    body:
      `Namaste ${firstName(ctx.fullName)} ji,\n\n` +
      `Main ${ctx.partnerName}. Humari rishte ke baare me baat hui thi — maine aapke liye BandhanTak par jagah bana di hai.\n\n` +
      `BandhanTak par verified profiles hain, aur aapki details sirf aapke control me rehti hain. Neeche link se apni profile bana lijiye; main bhi yahin se aapke liye achhe rishte dekhta rahunga:\n\n` +
      `${ctx.inviteUrl}\n\n` +
      `Agar abhi interest nahi hai to is email ka reply kar dijiyega — main dobara message nahi karunga.\n\n` +
      `- ${ctx.partnerName}`,
  };
}
