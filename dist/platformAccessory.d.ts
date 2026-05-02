import { CharacteristicValue, PlatformAccessory } from 'homebridge';
import { HomebridgeTedeePlatform } from './platform';
import { Lock } from './clients/models/lock';
import { LockState } from './clients/models/lock-state';
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export declare class LockAccessory {
    private readonly platform;
    readonly accessory: PlatformAccessory;
    private service;
    private battery;
    private readonly id;
    private readonly name;
    /**
     * These are just used to create a working example
     * You should implement your own code to track the state of your accessory
     */
    private state;
    constructor(platform: HomebridgeTedeePlatform, accessory: PlatformAccessory);
    /**
     * Handle requests to set the "Lock Target State" characteristic
     */
    handleLockTargetStateSet(newValue: CharacteristicValue): Promise<void>;
    /**
     * Handle requests to get the current value of the "Status Low Battery" characteristic
     */
    handleStatusLowBatteryGet(): 0 | 1;
    handleStatusBatteryLevelGet(): number;
    handleStatusChargingStateGet(): 0 | 1;
    handleLockCurrentStateGet(): 0 | 1 | 2 | 3;
    handleLockTargetStateGet(): 0 | 1 | 2 | 3;
    /**
     * Updates the device from the API.
     */
    updateAsync(): Promise<void>;
    /**
     * Updates the state of the lock.
     * @param lock
     */
    update(lock: Lock): void;
    updateBattery(batteryLevel: number): void;
    updateCharging(isCharging: 0 | 1): void;
    updateState(state: LockState, jammed: 0 | 1): void;
}
//# sourceMappingURL=platformAccessory.d.ts.map