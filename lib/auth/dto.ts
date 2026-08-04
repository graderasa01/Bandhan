import type { User } from "@prisma/client";
import type { UserDto } from "@/lib/contracts/auth";

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    full_name: user.fullName,
    mobile: user.mobile,
    email: user.email,
    mobile_verified_at: user.mobileVerifiedAt?.toISOString() ?? null,
    email_verified_at: user.emailVerifiedAt?.toISOString() ?? null,
    last_login_at: user.lastLoginAt?.toISOString() ?? null,
    created_at: user.createdAt.toISOString(),
  };
}
