// Read-only view of costume combinations that need studio review.
import {PrismaClient} from '@prisma/client';
const approved: {costumeId:string;pose:string;storedWebpSha256:string}[] = require('./ai-photo-composite-bases/approved.json');
const db = new PrismaClient();

async function listReviews() {
  const rows = await db.$queryRaw<{costume_id:string;pose:string;policy_failures:number;fitting_failures:number;last_failed_at:Date;verified_base_sha256:string|null;last_verified_at:Date|null}[]>`
    SELECT costume_id, pose, policy_failures, fitting_failures, last_failed_at, verified_base_sha256, last_verified_at
    FROM ai_costume_fit_reviews
    ORDER BY policy_failures + fitting_failures DESC, last_failed_at DESC, costume_id, pose`;
  const reviews = rows.map(row => ({
    ...row,
    policy_failures: Number(row.policy_failures),
    fitting_failures: Number(row.fitting_failures),
    mapped: approved.some(base => base.costumeId === row.costume_id && base.pose === row.pose)
  }));
  console.log(JSON.stringify(reviews, null, 2));
}

listReviews().catch(() => {
  console.error('Could not read the costume review queue.');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
