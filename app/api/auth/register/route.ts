import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { toUserDto } from "@/lib/auth/dto";
import { normalizeCode } from "@/lib/services/referral/code";
import { REFERRAL_COOKIE, readReferralCookie } from "@/lib/services/referral/cookie";
import type { ApiErrorResponse } from "@/lib/contracts/auth";

export const runtime = "nodejs";

const RegisterSchema = z
  .object({
    full_name: z.string().trim().min(2, "Naam kam se kam 2 characters ka hona chahiye."),
    mobile: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, "Valid 10-digit mobile number daaliye.")
      .optional(),
    email: z.string().trim().email("Valid email daaliye.").optional(),
    password: z.string().min(8, "Password kam se kam 8 characters ka hona chahiye."),
    referral_code: z.string().trim().optional(),
  })
  .refine((d) => d.mobile || d.email, {
    message: "Mobile ya email me se ek zaroori hai.",
    path: ["mobile"],
  });

function bad(error: string, message: string, status: number) {
  return NextResponse.json({ error, message } satisfies ApiErrorResponse, { status });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad("BAD_REQUEST", "Request JSON padha nahi ja saka.", 400);
  }

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return bad("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Form sahi se bharein.", 422);
  }
  const { full_name, mobile, email, password, referral_code } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: {
      OR: [mobile ? { mobile } : undefined, email ? { email } : undefined].filter(
        (c): c is NonNullable<typeof c> => Boolean(c),
      ),
    },
  });
  if (existing) {
    return bad("ALREADY_EXISTS", "Is mobile ya email se account pehle se bana hua hai.", 409);
  }

  // Typed code wins over the cookie — someone who deliberately entered a code
  // meant that one, whatever link they happened to click earlier.
  const jar = await cookies();
  const cookieCode = await readReferralCookie(jar.get(REFERRAL_COOKIE)?.value);
  const candidateCode = referral_code?.trim() ? normalizeCode(referral_code) : cookieCode;

  const attributedTo = candidateCode
    ? await prisma.referralCode.findUnique({
        where: { code: candidateCode },
        include: { partner: { select: { id: true, status: true } } },
      })
    : null;
  const attributable =
    attributedTo?.active === true &&
    (attributedTo.partner.status === "APPROVED" || attributedTo.partner.status === "ACTIVE");

  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { fullName: full_name, mobile, email, passwordHash, role: "USER", status: "INCOMPLETE" },
    });

    // A bad or expired code must never cost someone their account — the
    // registration succeeds either way and the UI just notes it quietly.
    if (attributable && attributedTo) {
      await tx.partnerReferral.create({
        data: {
          userId: created.id,
          partnerId: attributedTo.partner.id,
          codeUsed: attributedTo.code,
          attributionMethod: referral_code?.trim() ? "CODE" : "LINK",
        },
      });
    }

    return created;
  });

  await createSession({
    userId: user.id,
    role: user.role,
    status: user.status,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  console.info(`[auth:register] user=${user.id}`);

  return NextResponse.json({ user: toUserDto(user) }, { status: 201 });
}
