// Explicit target only. Read-only report of business references missing a member.
import { PrismaClient } from "@prisma/client";
async function main() {
  if (!process.env.MEMBER_MIGRATION_DATABASE_URL) throw new Error("Explicit MEMBER_MIGRATION_DATABASE_URL required");
  const db = new PrismaClient({ datasources: { db: { url: process.env.MEMBER_MIGRATION_DATABASE_URL } } });
  try {
    const columns = await db.$queryRawUnsafe<{ TABLE_NAME: string; COLUMN_NAME: string }[]>(
      "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('user_id','user_sub','owner_id','follower_id','following_id','tagged_user_id')");
    const references = [];
    for (const { TABLE_NAME: table, COLUMN_NAME: column } of columns) {
      if (!/^[a-zA-Z0-9_]+$/.test(table + column)) throw new Error("Unexpected schema identifier");
      const result = await db.$queryRawUnsafe<{ missing: bigint }[]>(`SELECT COUNT(DISTINCT t.\`${column}\`) AS missing FROM \`${table}\` t LEFT JOIN members m ON m.id=t.\`${column}\` WHERE t.\`${column}\` IS NOT NULL AND m.id IS NULL`);
      references.push({ table, column, missing: Number(result[0].missing) });
    }
    const pending = await db.member.count({ where: { enabled: true, cognito_username: { not: null }, password_hash: null } });
    console.log(JSON.stringify({ total: await db.member.count(), pendingPasswords: pending, references }, null, 2));
    if (pending || references.some(r => r.missing)) process.exitCode = 2;
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Member audit failed; verify target schema and permissions."); process.exitCode = 1; });
