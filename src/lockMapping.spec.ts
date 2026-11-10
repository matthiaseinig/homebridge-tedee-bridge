import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';

import {
  isValidBatteryLevel,
  mapCurrentState,
  mapTargetState,
  resolveBatteryLevel,
  TARGET_SECURED,
  TARGET_UNSECURED,
} from './lockMapping';

const ALL_STATES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 255];

describe('mapCurrentState', () => {
  it('only returns legal LockCurrentState values (0-3) for every state', () => {
    for (const state of ALL_STATES) {
      for (const jammed of [false, true]) {
        const value = mapCurrentState(state, jammed);
        assert.ok(Number.isInteger(value) && value >= 0 && value <= 3, `state ${state} jammed ${jammed} -> ${value}`);
      }
    }
  });

  it('reports jammed when the lock is jammed, uncalibrated or calibrating', () => {
    assert.equal(mapCurrentState(6, true), 2);
    assert.equal(mapCurrentState(0, false), 2);
    assert.equal(mapCurrentState(1, false), 2);
  });

  it('reports unknown for state 9 and unexpected values', () => {
    assert.equal(mapCurrentState(9, false), 3);
    assert.equal(mapCurrentState(42, false), 3);
  });

  it('maps open and closed', () => {
    assert.equal(mapCurrentState(2, false), 0);
    assert.equal(mapCurrentState(6, false), 1);
  });
});

describe('mapTargetState', () => {
  it('only returns 0, 1 or undefined for every state, never 2 or 3', () => {
    for (const state of [...ALL_STATES, 42, -1]) {
      for (const jammed of [false, true]) {
        const value = mapTargetState(state, jammed);
        assert.ok(value === undefined || value === 0 || value === 1, `state ${state} jammed ${jammed} -> ${value}`);
      }
    }
  });

  it('derives unsecured from open, opening, pull spring, pulling and unpulling', () => {
    for (const state of [2, 4, 7, 8, 255]) {
      assert.equal(mapTargetState(state, false), TARGET_UNSECURED);
    }
  });

  it('derives secured from partially open, closing and closed', () => {
    for (const state of [3, 5, 6]) {
      assert.equal(mapTargetState(state, false), TARGET_SECURED);
    }
  });

  it('gives no direction for jammed, uncalibrated, calibrating and unknown', () => {
    assert.equal(mapTargetState(6, true), undefined);
    for (const state of [0, 1, 9, 42]) {
      assert.equal(mapTargetState(state, false), undefined);
    }
  });
});

describe('battery level', () => {
  it('accepts 0 to 100 only', () => {
    assert.equal(isValidBatteryLevel(0), true);
    assert.equal(isValidBatteryLevel(100), true);
    assert.equal(isValidBatteryLevel(255), false);
    assert.equal(isValidBatteryLevel(101), false);
    assert.equal(isValidBatteryLevel(-1), false);
    assert.equal(isValidBatteryLevel(NaN), false);
    assert.equal(isValidBatteryLevel(undefined), false);
    assert.equal(isValidBatteryLevel('50'), false);
  });

  it('keeps the last known value when the level is unknown (255)', () => {
    assert.equal(resolveBatteryLevel(255, 73), 73);
    assert.equal(resolveBatteryLevel(undefined, 73), 73);
  });

  it('uses a valid new value', () => {
    assert.equal(resolveBatteryLevel(42, 73), 42);
    assert.equal(resolveBatteryLevel(0, 73), 0);
  });
});
