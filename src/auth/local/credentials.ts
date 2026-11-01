import { randomBytes, createHash, scrypt, timingSafeEqual } from "crypto";
import { ServiceUnavailableException, BadRequestException } from "@nestjs/common";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const normalizeEmail = (email: string) => {
  if (typeof email !== "string" || email.length > 191) throw new BadRequestException("이메일을 확인해주세요.");
  return email.trim().toLowerCase();
};
let active = 0;
async function derive(password: string, salt: string): Promise<Buffer> {
  if (active >= 2) throw new ServiceUnavailableException("잠시 후 다시 시도해주세요.");
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64,
      { N: 65536, r: 8, p: 2, maxmem: 96 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key)));
  } finally { active--; }
}
export async function hashPassword(password: string) {
  if (typeof password !== "string" || password.length < 8 || password.length > 256)
    throw new BadRequestException("비밀번호는 8~256자여야 합니다.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
// One contract for every place a password is set (signup, change, reset, operator change).
// Edge whitespace is rejected rather than trimmed so the stored secret is exactly what sign-in sees.
export const PASSWORD_MAX = 128;
export function assertNewPassword(password: unknown, minimum = 8): string {
  if (typeof password !== "string" || password.length < minimum || password.length > PASSWORD_MAX)
    throw new BadRequestException(`비밀번호는 ${minimum}~${PASSWORD_MAX}자여야 합니다.`);
  if (password !== password.trim()) throw new BadRequestException("비밀번호 앞뒤에는 공백을 넣을 수 없습니다.");
  return password;
}
// Sign-in compares the value as typed; older accounts stored a trimmed value, so the trimmed
// form is tried only when it differs (no second key derivation in the usual case).
export async function matchesPassword(password: unknown, encoded: string) {
  if (typeof password !== "string") return false;
  if (await verifyPassword(password, encoded)) return true;
  const trimmed = password.trim();
  return trimmed !== password && trimmed.length > 0 && verifyPassword(trimmed, encoded);
}
export async function verifyPassword(password: string, encoded: string) {
  if (typeof password !== "string" || password.length > 256) return false;
  const [version, salt, hash] = (encoded || "").split("$");
  if (version !== "scrypt-v1" || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hash, "hex"));
}
