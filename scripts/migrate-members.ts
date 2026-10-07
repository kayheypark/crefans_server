// No dotenv loading: the target database and pool must be passed explicitly.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { importMembers } from "../src/auth/local/import-members";

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!file || !process.env.MEMBER_MIGRATION_DATABASE_URL || !process.env.MEMBER_MIGRATION_POOL_ID)
    throw new Error("Usage: set MEMBER_MIGRATION_DATABASE_URL and MEMBER_MIGRATION_POOL_ID; ts-node scripts/migrate-members.ts snapshot.json [--apply]");
  const db = new PrismaClient({ datasources: { db: { url: process.env.MEMBER_MIGRATION_DATABASE_URL } } });
  try { console.log(await importMembers(db, JSON.parse(readFileSync(file, "utf8")), process.env.MEMBER_MIGRATION_POOL_ID, apply)); }
  finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Import aborted. Check snapshot identity conflicts/configuration; no credentials were logged."); process.exitCode = 1; });
