import { PrismaClient } from "@prisma/client";
import { normalizeEmail } from "./credentials";

export function prepareMembers(snapshot: any, expectedPool: string) {
  if (!expectedPool || snapshot?.userPoolId !== expectedPool || snapshot?.complete !== true || !Array.isArray(snapshot.users))
    throw new Error("Complete export from the expected Cognito pool is required");
  const ids = new Set<string>(), emails = new Set<string>(), handles = new Set<string>(), usernames = new Set<string>();
  return snapshot.users.map((user: any) => {
    const a = Object.fromEntries((user.UserAttributes || []).map((v: any) => [v.Name, v.Value]));
    if (!a.sub || !a.email || !a.preferred_username || !user.Username || !a.name || !a.nickname || typeof user.Enabled !== "boolean")
      throw new Error("Missing required identity attributes; resolve before importing");
    if (user.UserMFASettingList?.length || user.MFAOptions?.length || !["CONFIRMED", "UNCONFIRMED", "RESET_REQUIRED", "FORCE_CHANGE_PASSWORD"].includes(user.UserStatus))
      throw new Error("MFA/federated/unsupported accounts need a separate migration plan");
    const email = normalizeEmail(String(a.email));
    const handle = String(a.preferred_username);
    for (const [set, value] of [[ids, a.sub], [emails, email], [handles, handle.toLowerCase()], [usernames, user.Username]] as [Set<string>, string][]) {
      if (value.length > 191 || set.has(value)) throw new Error("Duplicate/oversized identity; import aborted");
      set.add(value);
    }
    return { id: String(a.sub), email, cognito_username: String(user.Username), name: String(a.name), nickname: String(a.nickname),
      preferred_username: handle, phone_number: String(a.phone_number || ""), picture: a.picture ? String(a.picture) : null,
      email_verified: a.email_verified === "true", enabled: user.Enabled, status: String(user.UserStatus),
      created_at: user.UserCreateDate ? new Date(user.UserCreateDate) : new Date(),
    };
  });
}

export async function importMembers(prisma: PrismaClient, snapshot: any, expectedPool: string, apply = false) {
  const rows = prepareMembers(snapshot, expectedPool);
  // Whole import is transactional. Never rewrite a migrated password or local profile on rerun.
  return prisma.$transaction(async tx => {
    let created = 0, unchanged = 0;
    for (const row of rows) {
      const existing = await tx.member.findFirst({ where: { OR: [{ id: row.id }, { email: row.email }, { cognito_username: row.cognito_username }, { preferred_username: row.preferred_username }] } });
      if (existing) {
        if (existing.id !== row.id || existing.cognito_username !== row.cognito_username || existing.email !== row.email)
          throw new Error("Existing identity collision; no members imported");
        unchanged++;
      } else {
        created++;
        if (apply) await tx.member.create({ data: row });
      }
    }
    return { mode: apply ? "apply" : "dry-run", total: rows.length, created, unchanged };
  }, { timeout: 120000 });
}
