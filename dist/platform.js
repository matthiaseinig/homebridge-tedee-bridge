"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeTedeePlatform = void 0;
const settings_1 = require("./settings");
const platformAccessory_1 = require("./platformAccessory");
const tedee_local_api_client_1 = require("./clients/tedee-local-api-client");
const os_1 = __importDefault(require("os"));
const http_1 = require("http");
const evilscan_1 = __importDefault(require("evilscan"));
const fs_1 = __importDefault(require("fs"));
/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
class HomebridgeTedeePlatform {
    /**
     * Gets the client that is used to communicate via HTTP API.
     */
    get apiClient() {
        if (!this._apiClient) {
            throw new Error('Platform not initialized yet.');
        }
        return this._apiClient;
    }
    get server() {
        if (!this._server) {
            throw new Error('Server not initialized.');
        }
        return this._server;
    }
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        // this is used to track restored cached accessories
        this.accessories = [];
        // this is used to track active locks
        this.activeLocks = [];
        /**
         * Contains the client that is used to communicate via HTTP API.
         */
        this._apiClient = null;
        this.config.timeout = config.timeout || 10000;
        this.config.maximumApiRetry = config.maximumApiRetry || 3;
        this.config.webhookPort = config.webhookPort || 3003;
        this.log.debug('Finished initializing platform:', this.config.name);
        // Homebridge 1.8.0 introduced a `log.success` method that can be used to log success messages
        // For users that are on a version prior to 1.8.0, we need a 'polyfill' for this method
        if (!log.success) {
            log.success = log.info;
        }
        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => {
            this.discoverBridge()
                .then((addr) => {
                this.connectBridge(addr);
                this.discoverDevices();
            }, (e) => {
                this.log.warn('Failed to discover bridge!');
            });
        });
        this.api.on('shutdown', () => {
            this.shutdown();
        });
    }
    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to set up event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        // add the restored accessory to the accessories cache, so we can track if it has already been registered
        this.accessories.push(accessory);
    }
    discoverBridge() {
        this.log.info(`Discovering tedee bridge...`);
        return new Promise((resolve, reject) => {
            if (this.config.bridgeIp) {
                // Proceed with the provided IP
                this.checkForBridgeApi(this.config.bridgeIp)
                    .then(addr => resolve(addr), () => {
                    this.autoDiscover()
                        .then(addr => resolve(addr))
                        .catch(error => {
                        this.log.warn('Failed to discover bridge. For more information see the README.');
                        this.log.debug(JSON.stringify(error));
                        reject(error);
                    });
                });
            }
            else {
                this.autoDiscover()
                    .then(addr => resolve(addr))
                    .catch(error => {
                    this.log.warn('Failed to discover bridge. For more information see the README.');
                    this.log.debug(JSON.stringify(error));
                    reject(error);
                });
            }
        });
    }
    autoDiscover() {
        return new Promise((resolve, reject) => {
            const options = {
                target: this.getNetworkConfiguration(),
                port: '80',
                status: 'O',
                reverse: true,
            };
            const scan = new evilscan_1.default(options);
            const results = [];
            scan.on('result', (data) => {
                this.log.debug(`Found device at ${data.ip} (${data.reverse})`);
                results.push({ ip: data.ip, reverse: data.reverse });
            });
            scan.on('error', err => {
                this.log.debug(JSON.stringify(err));
            });
            scan.on('done', () => {
                if (results.length === 0) {
                    reject(new Error('No bridge found in the network'));
                    return;
                }
                const checkNext = (results) => {
                    const next = results.shift();
                    if (next === undefined) {
                        reject(new Error('No bridge found in the network'));
                        return;
                    }
                    const nextAddr = next.reverse && next.reverse != '' ? next.reverse : next.ip;
                    this.checkForBridgeApi(nextAddr)
                        .then((addr) => resolve(addr), () => {
                        checkNext(results);
                    });
                };
                checkNext(results);
            });
            scan.run();
        });
    }
    checkForBridgeApi(addr) {
        return new Promise((resolve, reject) => {
            const testClient = new tedee_local_api_client_1.TedeeLocalApiClient(addr, this.config.apiKey, this.config.timeout, 2, (e) => {
                this.log.error(e);
                reject(e);
            }, (d) => this.log.debug(d));
            testClient.checkApiHealth()
                .then(response => {
                this.log.debug(`API Check ${response ? 'SUCCESSFUL' : 'FAILED'}: ${addr}`);
                if (response) {
                    resolve(addr);
                }
                else {
                    reject(new Error('API Check Fail! Trying next IP if available...'));
                }
            });
        });
    }
    getNetworkConfiguration() {
        const interfaces = os_1.default.networkInterfaces();
        let networkConfig = '';
        // Iterate through each network interface
        for (const iface of Object.values(interfaces)) {
            // @ts-ignore
            for (const config of iface) {
                // Check if the address is IPv4 and not an internal (loopback) address
                if (config.family === 'IPv4' && !config.internal) {
                    // Calculate the subnet mask in CIDR notation
                    const cidr = this.netmaskToCIDR(config.netmask);
                    networkConfig = `${config.address}/${cidr}`;
                    this.log.debug(`Network configuration: ${networkConfig}`);
                    return networkConfig; // Return the first valid configuration
                }
            }
        }
        if (!networkConfig) {
            this.log.debug('No suitable network interface found.');
        }
    }
    netmaskToCIDR(netmask) {
        // Convert netmask to CIDR by counting the number of set bits
        return netmask.split('.')
            .map(octet => parseInt(octet, 10).toString(2).replace(/0/g, '').length)
            .reduce((cidr, numBits) => cidr + numBits, 0);
    }
    connectBridge(ip) {
        // Initializes the client
        this._apiClient = new tedee_local_api_client_1.TedeeLocalApiClient(ip, this.config.apiKey, this.config.timeout, this.config.maximumApiRetry, (e) => this.log.error(e), (d) => this.log.debug(d));
        this.saveAddr(ip);
        this.log.debug(`Initialized API client with IP ${ip} and API key ${this.config.apiKey}`);
    }
    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    discoverDevices() {
        this.apiClient.getLockList()
            .then(locks => {
            this.log.debug(`Found ${locks.length} locks.`);
            this.log.debug(`Locks: ${JSON.stringify(locks)}`);
            this.registerLocks(locks);
        })
            .catch(e => {
            this.log.error('Failed to get locks from the API');
            this.log.debug(JSON.stringify(e));
            return;
        });
    }
    registerLocks(locks) {
        // loop over the discovered devices and register each one if it has not already been registered
        let hasLocks = false;
        const validUuids = [];
        for (const lock of locks) {
            let deviceConfiguration = this.config.devices.find(l => l.name === lock.name);
            if (!deviceConfiguration) {
                deviceConfiguration = {
                    name: lock.name,
                    ignored: false,
                    unlatchFromUnlockedToUnlocked: true,
                    unlatchLock: false,
                    disableUnlock: false,
                    defaultLockName: lock.name,
                    defaultLatchName: lock.name + ' Latch',
                };
            }
            // generate a unique id for the accessory this should be generated from
            // something globally unique, but constant, for example, the device serial
            // number or MAC address
            const uuid = this.api.hap.uuid.generate(lock.serialNumber);
            validUuids.push(uuid);
            // see if an accessory with the same uuid has already been registered and restored from
            // the cached devices we stored in the `configureAccessory` method above
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                // the accessory already exists
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
                // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
                existingAccessory.context.device = lock;
                this.api.updatePlatformAccessories([existingAccessory]);
                // create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                const lockAccessory = new platformAccessory_1.LockAccessory(this, existingAccessory);
                // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
                // remove platform accessories when no longer present
                if (deviceConfiguration.ignored) {
                    this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [existingAccessory]);
                    this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
                }
                else {
                    hasLocks = true;
                    this.activeLocks.push(lockAccessory);
                }
            }
            else {
                if (deviceConfiguration.ignored) {
                    continue;
                }
                // the accessory does not yet exist, so we need to create it
                this.log.info('Adding new accessory:', lock.name);
                // create a new accessory
                const accessory = new this.api.platformAccessory(lock.name, uuid);
                // store a copy of the device object in the `accessory.context`
                // the `context` property can be used to store any data about the accessory you may need
                accessory.context.device = lock;
                // create the accessory handler for the newly create accessory
                // this is imported from `platformAccessory.ts`
                const lockAccessory = new platformAccessory_1.LockAccessory(this, accessory);
                // link the accessory to your platform
                this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
                this.activeLocks.push(lockAccessory);
                hasLocks = true;
            }
        }
        for (const accessory of this.accessories) {
            if (!validUuids.includes(accessory.UUID)) {
                this.log.info('Removing existing accessory from cache:', accessory.displayName);
                this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
            }
        }
        if (!hasLocks) {
            return;
        }
        this.log.info(`Starting webhook server on port ${this.config.webhookPort}...`);
        this._server = (0, http_1.createServer)((req, res) => this.handleWebhook(req, res));
        this._server.on('error', (e) => {
            if (e.code === 'EADDRINUSE') {
                this.log.error(`Webhook port ${this.config.webhookPort} is already in use. When running multiple TedeeBridge instances, set a different "webhookPort" for each.`);
            }
            else {
                this.log.error(`Webhook server error: ${e.message}`);
            }
        });
        this._server.listen(this.config.webhookPort);
        this.log.info(`Webhook server started successfully!`);
        this.log.info(`Registering webhook callback...`);
        const webhookUrl = `http://${this.getHomebridgeIpAddress()}:${this.config.webhookPort}/`;
        this.log.debug(`Webhook URL: ${webhookUrl}`);
        this.apiClient.setMultipleCallbacks([{
                url: webhookUrl,
                method: 'POST',
                headers: [],
            }]).then(callback => {
            this.log.debug(`Callback response: ${JSON.stringify(callback)}`);
            this.log.info(`Webhook callback registered successfully!`);
            this.log.debug(`Callback ID: ${callback[0]}`);
            this.callbackId = callback[0];
        }).catch(e => {
            this.log.error('Failed to register webhook callback');
            this.log.debug(JSON.stringify(e));
            return;
        });
    }
    getHomebridgeIpAddress() {
        const networkInterfaces = os_1.default.networkInterfaces();
        for (const name of Object.keys(networkInterfaces)) {
            // @ts-ignore
            for (const net of networkInterfaces[name]) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return null;
    }
    saveAddr(addr) {
        fs_1.default.readFile(this.api.user.configPath(), 'utf8', (err, data) => {
            if (err) {
                this.log.debug('Failed to read config file:', err);
                return;
            }
            // Parse the current configuration
            let config = JSON.parse(data);
            // Find this platform's own config block. With multiple instances we must
            // match on name as well, otherwise every instance would overwrite the
            // bridgeIp of the first TedeeBridge entry.
            const matching = config.platforms.filter(p => p.platform === settings_1.PLATFORM_NAME);
            let targetPlatform;
            if (matching.length <= 1) {
                targetPlatform = matching[0];
            }
            else {
                targetPlatform = matching.find(p => p.name === this.config.name);
            }
            if (targetPlatform) {
                targetPlatform.bridgeIp = addr;
                this.log.debug('Updated config with new IP:', targetPlatform.bridgeIp);
            }
            else {
                this.log.debug(`No matching platform found for name "${this.config.name}". Set a unique "name" on each TedeeBridge platform when running multiple instances.`);
                return;
            }
            // Write the modified configuration back to the file
            fs_1.default.writeFile(this.api.user.configPath(), JSON.stringify(config, null, 4), (err) => {
                if (err) {
                    this.log.debug('Failed to write updated config file:', err);
                }
                else {
                    this.log.debug('Configuration updated successfully!');
                }
            });
        });
    }
    async handleWebhook(req, res) {
        // Parse the incoming request
        let body = '';
        for await (const chunk of req) {
            body += chunk;
        }
        const payload = JSON.parse(body);
        if (payload.event == 'backend-connection-changed' || payload.event == 'device-connection-changed') {
            if (payload.event == 'backend-connection-changed') {
                // @ts-ignore
                this.log.info('Webhook: Backend ' + (payload.data.isConnected ? 'connected' : 'disconnected'));
            }
            else {
                // @ts-ignore
                this.log.info('Webhook: Device with id ' + payload.data.deviceId + ' ' + (payload.data.isConnected ? 'connected' : 'disconnected'));
            }
            res.statusCode = 200;
            res.end('Nevermind ;)');
            return;
        }
        // @ts-ignore
        const data = payload.data;
        // Identify the lock that needs to be updated
        const lock = this.activeLocks.find(lock => lock.accessory.context.device.id === data.deviceId);
        if (!lock) {
            this.log.warn('Webhook: Device not found with id ' + data.deviceId);
            res.statusCode = 404;
            res.end('Lock not found');
            return;
        }
        switch (payload.event) {
            case 'device-settings-changed':
                this.log.info('Webhook: Device settings changed for device with id ' + data.deviceId);
                await lock.updateAsync();
                break;
            case 'device-battery-fully-charged':
                this.log.info('Webhook: Battery fully charged for device with id ' + data.deviceId);
                lock.updateBattery(100);
                lock.updateCharging(0);
                break;
            case 'device-battery-start-charging':
                this.log.info('Webhook: Battery started charging for device with id ' + data.deviceId);
                lock.updateCharging(1);
                break;
            case 'device-battery-level-changed':
                this.log.info('Webhook: Battery level changed for device with id ' + data.deviceId);
                // @ts-ignore
                lock.updateBattery(data.batteryLevel);
                break;
            case 'lock-status-changed':
                this.log.info('Webhook: Lock status changed for device with id ' + data.deviceId);
                // @ts-ignore
                lock.updateState(data.state, data.jammed);
                break;
            default:
                this.log.warn('Webhook: Unknown event type ' + payload.event);
                res.statusCode = 400;
                res.end('Unknown event type');
                return;
        }
        res.statusCode = 200;
        res.end('Lock updated successfully');
    }
    shutdown() {
        if (this.callbackId) {
            this.log.info(`Deleting webhook callback...`);
            this.apiClient.deleteCallback(this.callbackId)
                .then(() => {
                this.log.debug('Webhook callback deleted successfully!');
            })
                .catch(e => {
                this.log.error('Failed to delete webhook callback');
                this.log.debug(JSON.stringify(e));
            });
        }
        // Close the server
        if (this._server) {
            this.log.info(`Shutting down webhook server...`);
            this.server.close((e) => {
                if (e) {
                    this.log.error('Failed to shut down webhook server!');
                    this.log.debug(JSON.stringify(e));
                }
                else {
                    this.log.debug('Webhook server shutdown successfully!');
                }
            });
        }
    }
}
exports.HomebridgeTedeePlatform = HomebridgeTedeePlatform;
//# sourceMappingURL=platform.js.map