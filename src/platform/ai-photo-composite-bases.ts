import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

type ApprovedBase = {costumeId: string; pose: string; storedWebpSha256: string};
const approved: readonly ApprovedBase[] = require('./ai-photo-composite-bases/approved.json');
const assets = join(__dirname, 'ai-photo-composite-bases');

export async function readCostumeCompositeBase(costumeId: string, request: string, hasPose = true): Promise<Buffer | null> {
  if (!/^[0-9a-f]{6}$/.test(costumeId)) return null;
  const poses = hasPose ? request.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [''];
  const matches = approved.filter(base => base.costumeId === costumeId && poses.includes(base.pose));
  if (matches.length !== 1) return null;
  const digest = matches[0].storedWebpSha256;
  if (!/^[0-9a-f]{64}$/.test(digest)) return null;

  try {
    const image = await readFile(join(assets, digest + '.webp'));
    return createHash('sha256').update(image).digest('hex') === digest ? image : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
