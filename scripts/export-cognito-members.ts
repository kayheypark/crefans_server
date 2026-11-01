// Run deliberately with read-only Cognito credentials. Output contains PII; keep outside the repository.
import { CognitoIdentityProviderClient, ListUsersCommand, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { writeFileSync } from "fs";
async function main() {
  const userPoolId = process.env.MEMBER_MIGRATION_POOL_ID;
  const file = process.argv[2];
  if (!userPoolId || !file) throw new Error("MEMBER_MIGRATION_POOL_ID and output file required");
  const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "ap-northeast-2" });
  const users = [];
  let PaginationToken: string | undefined;
  do {
    const page = await client.send(new ListUsersCommand({ UserPoolId: userPoolId, Limit: 60, PaginationToken }));
    for (const user of page.Users || []) users.push(await client.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: user.Username })));
    PaginationToken = page.PaginationToken;
  } while (PaginationToken);
  writeFileSync(file, JSON.stringify({ userPoolId, complete: true, exportedAt: new Date().toISOString(), users }, null, 2), { mode: 0o600, flag: "wx" });
  console.log(`Exported ${users.length} identities; passwords are not exported.`);
}
main().catch(() => { console.error("Export failed; no complete snapshot written. Check permissions and output path."); process.exitCode = 1; });
