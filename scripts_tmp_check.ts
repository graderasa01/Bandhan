import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const refs = await prisma.partnerReferral.findMany({
    include: { user: { select: { fullName: true, email: true } }, partner: { select: { fullName: true } } },
  });
  console.log("PartnerReferral rows:", refs.length);
  for (const r of refs) {
    console.log(` - ${r.user.fullName} <- ${r.partner.fullName} via ${r.codeUsed} (${r.attributionMethod}) locked=${r.locked}`);
  }

  const clicks = await prisma.referralClick.findMany();
  console.log("ReferralClick rows:", clicks.length, clicks.map((c) => `${c.code} ip=${c.ipHash?.slice(0, 8) ?? "null"}`));

  const audits = await prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  console.log("AdminAuditLog rows:", audits.length);
  for (const a of audits) console.log(` - ${a.actionType} ${a.previousValue ?? "-"}→${a.newValue ?? "-"} reason=${a.reason ?? "-"}`);
}

main().finally(() => prisma.$disconnect());
