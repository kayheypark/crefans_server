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
export async function verifyPassword(password: string, encoded: string) {
  if (typeof password !== "string" || password.length > 256) return false;
  const [version, salt, hash] = (encoded || "").split("$");
  if (version !== "scrypt-v1" || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hash, "hex"));
}
