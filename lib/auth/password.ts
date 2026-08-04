import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12; // M02 spec: bcrypt cost 12 or argon2id

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
