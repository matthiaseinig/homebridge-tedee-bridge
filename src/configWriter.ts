import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import {PLATFORM_NAME} from './settings';

type Entry = Record<string, any>;

export type SaveResult = 'updated' | 'unchanged' | 'skipped' | 'failed';

export interface OwnEntry {
  name?: string;
  apiKey?: string;
  bridgeIp?: string;
  _bridge?: { username?: string };
}

const hash = (value: unknown) => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');

/**
 * Finds the config entry of this platform instance, or returns null when it cannot be identified
 * with certainty. Never falls back to "the first TedeeBridge entry": with two bridges that
 * overwrote the other bridge's IP and caused 401s.
 *   1. the child bridge username (_bridge.username), if the instance has one
 *   2. otherwise name plus a hash of the apiKey, which must match exactly one entry
 */
export function findOwnEntry(platforms: Entry[], own: OwnEntry): Entry | null {
  const candidates = platforms.filter(p => p && p.platform === PLATFORM_NAME);

  const username = own._bridge?.username;
  if (username) {
    const byUsername = candidates.filter(p => String(p._bridge?.username ?? '').toLowerCase() === String(username).toLowerCase());
    return byUsername.length === 1 ? byUsername[0] : null;
  }

  if (!own.name || !own.apiKey) {
    return null;
  }
  const ownHash = hash(own.apiKey);
  const byIdentity = candidates.filter(p => p.name === own.name && !p._bridge?.username && hash(p.apiKey) === ownHash);
  return byIdentity.length === 1 ? byIdentity[0] : null;
}

/**
 * Stores a discovered bridge IP in the config entry of this instance only.
 * The file is read right before the write and only this entry's bridgeIp changes. Nothing is
 * written when the IP is already stored. The write goes to a temp file in the same folder and is
 * renamed over the config, so a crash cannot leave a half written config.json.
 */
export function saveBridgeIp(configPath: string, own: OwnEntry, addr: string, debug: (...args: unknown[]) => void): SaveResult {
  const tmpPath = path.join(path.dirname(configPath), `.${path.basename(configPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    if (!config || !Array.isArray(config.platforms)) {
      debug('Config has no platforms array; not saving the bridge IP.');
      return 'skipped';
    }

    const entry = findOwnEntry(config.platforms, own);
    if (!entry) {
      debug('Could not identify this bridge in the config (no unique _bridge.username or name plus API key match); not saving the bridge IP.');
      return 'skipped';
    }
    if (entry.bridgeIp === addr) {
      debug('Bridge IP already stored in the config; nothing to write.');
      return 'unchanged';
    }

    entry.bridgeIp = addr;
    const mode = fs.statSync(configPath).mode & 0o777;
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 4), {mode});
    fs.renameSync(tmpPath, configPath);
    debug('Updated config with new IP:', addr);
    return 'updated';
  } catch (e) {
    try {
      fs.rmSync(tmpPath, {force: true});
    } catch {
      // nothing to clean up
    }
    debug('Failed to save the bridge IP to the config file:', e);
    return 'failed';
  }
}
