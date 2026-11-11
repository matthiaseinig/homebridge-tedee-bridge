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
}

const hash = (value: unknown) => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');

/**
 * Finds the config entry of this platform instance, or returns null when it cannot be identified
 * with certainty. Never falls back to "the first TedeeBridge entry": with two bridges that
 * overwrote the other bridge's IP and caused 401s.
 * Matching is by name plus a hash of the apiKey and must hit exactly one entry. _bridge is
 * ignored on purpose: Homebridge removes it from the config before the platform constructor runs,
 * so the instance cannot see its own child bridge username.
 */
export function findOwnEntry(platforms: Entry[], own: OwnEntry): Entry | null {
  if (!own.name || !own.apiKey) {
    return null;
  }
  const ownHash = hash(own.apiKey);
  const matches = platforms.filter(p => p && p.platform === PLATFORM_NAME && p.name === own.name && hash(p.apiKey) === ownHash);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Stores a discovered bridge IP in the config entry of this instance only.
 * The file is read right before the write and only this entry's bridgeIp changes. Nothing is
 * written when the IP is already stored. The write goes to a temp file in the same folder and is
 * renamed over the config, so a crash cannot leave a half written config.json.
 */
export function saveBridgeIp(configPath: string, own: OwnEntry, addr: string, debug: (...args: unknown[]) => void): SaveResult {
  let tmpPath = '';
  try {
    // Write next to the real file so a symlinked config.json stays a symlink.
    const realPath = fs.realpathSync(configPath);
    tmpPath = path.join(path.dirname(realPath), `.${path.basename(realPath)}.${process.pid}.${Date.now()}.tmp`);
    const raw = fs.readFileSync(realPath, 'utf8');
    const config = JSON.parse(raw);
    if (!config || !Array.isArray(config.platforms)) {
      debug('Config has no platforms array; not saving the bridge IP.');
      return 'skipped';
    }

    const entry = findOwnEntry(config.platforms, own);
    if (!entry) {
      debug('Could not identify this bridge in the config (no unique name plus API key match); not saving the bridge IP.');
      return 'skipped';
    }
    if (entry.bridgeIp === addr) {
      debug('Bridge IP already stored in the config; nothing to write.');
      return 'unchanged';
    }

    entry.bridgeIp = addr;
    const st = fs.statSync(realPath);
    const fd = fs.openSync(tmpPath, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(config, null, 4));
      fs.fchmodSync(fd, st.mode & 0o7777);
      try {
        fs.fchownSync(fd, st.uid, st.gid);
      } catch {
        // not permitted to change the owner (not root); keep the current user
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, realPath);
    debug('Updated config with new IP:', addr);
    return 'updated';
  } catch (e) {
    try {
      if (tmpPath) {
        fs.rmSync(tmpPath, {force: true});
      }
    } catch {
      // nothing to clean up
    }
    debug('Failed to save the bridge IP to the config file:', e);
    return 'failed';
  }
}
