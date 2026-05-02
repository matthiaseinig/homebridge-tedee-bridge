/// <reference types="node" />
import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { LockAccessory } from './platformAccessory';
import { TedeeLocalApiClient } from './clients/tedee-local-api-client';
import { IncomingMessage, Server, ServerResponse } from 'http';
/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export declare class HomebridgeTedeePlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: PlatformAccessory[];
    activeLocks: LockAccessory[];
    /**
     * Contains the client that is used to communicate via HTTP API.
     */
    private _apiClient;
    private _server;
    private callbackId;
    /**
     * Gets the client that is used to communicate via HTTP API.
     */
    get apiClient(): TedeeLocalApiClient;
    get server(): Server<typeof IncomingMessage, typeof ServerResponse>;
    constructor(log: Logger, config: PlatformConfig, api: API);
    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to set up event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory): void;
    discoverBridge(): Promise<string>;
    autoDiscover(): Promise<string>;
    checkForBridgeApi(addr: string): Promise<string>;
    getNetworkConfiguration(): string | undefined;
    netmaskToCIDR(netmask: string): number;
    connectBridge(ip: string): void;
    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    discoverDevices(): void;
    registerLocks(locks: any): void;
    private getHomebridgeIpAddress;
    saveAddr(addr: any): void;
    handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void>;
    shutdown(): void;
}
//# sourceMappingURL=platform.d.ts.map