import {costumeReviewPoses} from './ai-costume-review-poses';

export type CostumeReviewTarget = {costumeId: string; pose: string};

/** Empty pose denotes the separate fitting that preserves the user's original pose. */
export function costumeReviewTarget(costumeId: string, request: string, hasPose: boolean): CostumeReviewTarget | undefined {
  if (!hasPose) return {costumeId, pose: ''};
  const poses = new Set(request.split(/\r?\n/).map(line => line.trim()).filter(line => costumeReviewPoses.has(line)));
  if (poses.size !== 1) return undefined;
  return {costumeId, pose: [...poses][0]};
}

export async function queueCostumeFailure(
  db: any, target: CostumeReviewTarget | undefined, errorCode: string, providerStatus?: number
) {
  if (!target) return;
  const policy = ['OUTPUT_MATERIAL_BLOCKED', 'PROVIDER_OUTPUT_BLOCKED', 'OUTPUT_BLOCKED_LIMIT', 'UNSAFE_OUTPUT'].includes(errorCode);
  const fitting = errorCode === 'PROVIDER_INPUT_ERROR' || (errorCode === 'PROVIDER_ERROR' && providerStatus === 200);
  if (!policy && !fitting) return;
  try {
    await db.$executeRaw`INSERT INTO ai_costume_fit_reviews (costume_id,pose,policy_failures,fitting_failures)
      VALUES (${target.costumeId},${target.pose},${Number(policy)},${Number(fitting)})
      ON DUPLICATE KEY UPDATE policy_failures=policy_failures+${Number(policy)},
        fitting_failures=fitting_failures+${Number(fitting)},last_failed_at=CURRENT_TIMESTAMP(3)`;
  } catch {
    // Diagnostics must not change the error or the quota returned to the user.
    console.warn(JSON.stringify({event:'ai-photo.costume_review_write_failed'}));
  }
}

/** Mark an existing failed combination as verified only after the edited photo has been saved. */
export async function recordSuccessfulCostumeRoute(db: any, target?: CostumeReviewTarget, digest?: string) {
  if (!target || !digest || !/^[a-f0-9]{64}$/.test(digest)) return;
  try {
    await db.$executeRaw`UPDATE ai_costume_fit_reviews SET verified_base_sha256=${digest}, last_verified_at=CURRENT_TIMESTAMP(3)
      WHERE costume_id=${target.costumeId} AND pose=${target.pose}
      AND (last_verified_at IS NULL OR last_verified_at<=last_failed_at OR verified_base_sha256<>${digest})`;
  } catch {
    console.warn(JSON.stringify({event:'ai-photo.costume_route_write_failed'}));
  }
}
