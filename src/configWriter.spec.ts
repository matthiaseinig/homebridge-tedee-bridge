import {strict as assert} from 'node:assert';
import {afterEach, beforeEach, describe, it} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {saveBridgeIp} from './configWriter';

const noLog = () => undefined;

const entryA = {platform: 'TedeeBridge', name: 'Tedee A', apiKey: 'key-a', bridgeIp: '192.168.1.10', _bridge: {username: '0E:11:11:11:11:11', port: 36001}};
const entryB = {platform: 'TedeeBridge', name: 'Tedee B', apiKey: 'key-b', bridgeIp: '192.168.1.20', _bridge: {username: '0E:22:22:22:22:22', port: 36002}};
const other = {platform: 'SomethingElse', name: 'Other', bridgeIp: '1.2.3.4'};

describe('saveBridgeIp', () => {
  let dir: string;
  let configPath: string;

  const write = (platforms: unknown[]) => fs.writeFileSync(configPath, JSON.stringify({bridge: {name: 'x'}, platforms}, null, 4));
  const read = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tedee-configwriter-spec-'));
    configPath = path.join(dir, 'config.json');
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('second instance saves: first entry stays unchanged, own entry is updated', () => {
    write([entryA, other, entryB]);
    const result = saveBridgeIp(configPath, structuredClone(entryB), '192.168.1.99', noLog);
    assert.equal(result, 'updated');
    const platforms = read().platforms;
    assert.deepEqual(platforms[0], entryA);
    assert.deepEqual(platforms[1], other);
    assert.deepEqual(platforms[2], {...entryB, bridgeIp: '192.168.1.99'});
  });

  it('first instance saves: second entry stays unchanged', () => {
    write([entryA, entryB]);
    assert.equal(saveBridgeIp(configPath, structuredClone(entryA), '192.168.1.55', noLog), 'updated');
    const platforms = read().platforms;
    assert.equal(platforms[0].bridgeIp, '192.168.1.55');
    assert.deepEqual(platforms[1], entryB);
  });

  it('identical IP: no write', () => {
    write([entryA, entryB]);
    const before = fs.statSync(configPath).mtimeMs;
    const raw = fs.readFileSync(configPath, 'utf8');
    assert.equal(saveBridgeIp(configPath, structuredClone(entryB), entryB.bridgeIp, noLog), 'unchanged');
    assert.equal(fs.readFileSync(configPath, 'utf8'), raw);
    assert.equal(fs.statSync(configPath).mtimeMs, before);
  });

  it('without _bridge: matches by name plus API key hash', () => {
    const a = {...entryA, _bridge: undefined};
    const b = {...entryB, _bridge: undefined};
    write([a, b]);
    assert.equal(saveBridgeIp(configPath, {name: b.name, apiKey: b.apiKey, bridgeIp: b.bridgeIp}, '10.0.0.2', noLog), 'updated');
    const platforms = read().platforms;
    assert.equal(platforms[0].bridgeIp, a.bridgeIp);
    assert.equal(platforms[1].bridgeIp, '10.0.0.2');
  });

  it('cannot identify the entry: skips and writes nothing', () => {
    write([entryA, entryB]);
    const raw = fs.readFileSync(configPath, 'utf8');
    // same name, wrong key
    assert.equal(saveBridgeIp(configPath, {name: 'Tedee B', apiKey: 'other', _bridge: undefined}, '10.0.0.3', noLog), 'skipped');
    // unknown username
    assert.equal(saveBridgeIp(configPath, {name: 'Tedee B', apiKey: 'key-b', _bridge: {username: '0E:99:99:99:99:99'}}, '10.0.0.3', noLog), 'skipped');
    // no name or key at all
    assert.equal(saveBridgeIp(configPath, {}, '10.0.0.3', noLog), 'skipped');
    assert.equal(fs.readFileSync(configPath, 'utf8'), raw);
  });

  it('ambiguous match (two identical entries without _bridge): skips', () => {
    const a = {platform: 'TedeeBridge', name: 'Same', apiKey: 'k', bridgeIp: '1.1.1.1'};
    write([a, {...a, bridgeIp: '2.2.2.2'}]);
    assert.equal(saveBridgeIp(configPath, {name: 'Same', apiKey: 'k'}, '3.3.3.3', noLog), 'skipped');
    assert.deepEqual(read().platforms.map((p: any) => p.bridgeIp), ['1.1.1.1', '2.2.2.2']);
  });

  it('uses the on-disk state at write time and keeps unrelated edits', () => {
    write([entryA, entryB]);
    // another writer changed entry A and added a platform after this instance started
    write([{...entryA, bridgeIp: '172.16.0.1'}, entryB, other]);
    assert.equal(saveBridgeIp(configPath, structuredClone(entryB), '192.168.1.77', noLog), 'updated');
    const platforms = read().platforms;
    assert.equal(platforms[0].bridgeIp, '172.16.0.1');
    assert.equal(platforms[1].bridgeIp, '192.168.1.77');
    assert.deepEqual(platforms[2], other);
  });

  it('writes atomically: no temp file left, file mode kept, invalid JSON left untouched', () => {
    write([entryA]);
    fs.chmodSync(configPath, 0o640);
    assert.equal(saveBridgeIp(configPath, structuredClone(entryA), '10.1.1.1', noLog), 'updated');
    assert.deepEqual(fs.readdirSync(dir), ['config.json']);
    assert.equal(fs.statSync(configPath).mode & 0o777, 0o640);

    fs.writeFileSync(configPath, '{ not json');
    assert.equal(saveBridgeIp(configPath, structuredClone(entryA), '10.1.1.2', noLog), 'failed');
    assert.equal(fs.readFileSync(configPath, 'utf8'), '{ not json');
    assert.deepEqual(fs.readdirSync(dir), ['config.json']);
  });
});
