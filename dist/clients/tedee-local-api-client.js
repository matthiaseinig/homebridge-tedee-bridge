"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TedeeLocalApiClient = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
class TedeeLocalApiClient {
    constructor(ip, apiKey, timeout = 10000, maxRetries = 3, error, debug) {
        this.apiKey = apiKey;
        this.maxRetries = maxRetries;
        this.client = axios_1.default.create({
            baseURL: 'http://' + ip + '/v1.0',
            headers: {
                accept: 'application/json',
            },
            timeout: timeout,
        });
        this.error = error !== null && error !== void 0 ? error : ((e) => {
            void (e);
        });
        this.debug = debug !== null && debug !== void 0 ? debug : ((e) => {
            void (e);
        });
        this.client.interceptors.request.use((config) => this.appendAuthHeader(config));
        this.client.interceptors.response.use((response) => response, (error) => this.handleErrorWithRetry(error));
    }
    generateApiToken() {
        const timestamp = Date.now();
        const hash = (0, crypto_1.createHash)('sha256').update(this.apiKey + timestamp).digest('hex');
        return `${hash}${timestamp}`;
    }
    appendAuthHeader(config) {
        config.headers['api_token'] = this.generateApiToken();
        return config;
    }
    handleResponse(response) {
        return response.data;
    }
    handleErrorWithRetry(error) {
        var _a;
        const config = error.config;
        if (!config) {
            return Promise.reject(error);
        }
        config.retriesCount = config.retriesCount || 0;
        // Check if we should retry the request
        if (!config || config.retriesCount >= this.maxRetries) {
            return Promise.reject(error);
        }
        function pause(milliseconds) {
            const dt = Date.now();
            while (Date.now() - dt <= milliseconds) {
                /* Do nothing */
            }
        }
        pause(500);
        this.debug(`Request failed with status code ${(_a = error.response) === null || _a === void 0 ? void 0 : _a.status}. Retrying...`);
        this.debug(`Retry attempt ${config.retriesCount + 1} of ${this.maxRetries}`);
        this.debug(JSON.stringify(error.response));
        // Increase the retry count
        config.retriesCount += 1;
        // Retry the request
        return this.client(config);
    }
    handleError(error) {
        var _a, _b;
        this.error(((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
        this.debug(JSON.stringify(error));
        return Promise.reject(((_b = error.response) === null || _b === void 0 ? void 0 : _b.data) || error.message);
    }
    async getBridgeDetails() {
        try {
            const response = await this.client.get('/bridge');
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    async checkApiHealth() {
        try {
            const response = await this.client.get('/bridge');
            // Return false if status is OK but content not to spec
            return response.status === 200 && this.isValidBridgeDetails(response.data);
        }
        catch (error) {
            return false; // Returns false if the request fails
        }
    }
    // Validation function to check if response matches the BridgeDetails schema
    isValidBridgeDetails(data) {
        return typeof data === 'object' &&
            typeof data.name === 'string' &&
            typeof data.currentTime === 'string' &&
            typeof data.serialNumber === 'string' &&
            typeof data.ssid === 'string' &&
            (data.isConnected === 0 || data.isConnected === 1) &&
            typeof data.version === 'string' &&
            typeof data.wifiVersion === 'string';
    }
    async getLockList() {
        try {
            const response = await this.client.get('/lock');
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    async getLockById(deviceId) {
        try {
            const response = await this.client.get(`/lock/${deviceId}`);
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    async lockDevice(deviceId) {
        try {
            const response = await this.client.post(`/lock/${deviceId}/lock`);
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    async unlockDevice(deviceId, mode) {
        if (typeof mode === 'undefined') {
            mode = 4;
        }
        try {
            const response = await this.client.post(`/lock/${deviceId}/unlock`, {
                mode: mode,
            });
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    async pullDevice(deviceId) {
        try {
            const response = await this.client.post(`/lock/${deviceId}/pull`);
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    // Callback methods
    async listCallbacks() {
        try {
            const response = await this.client.get('/callback');
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    async addCallback(callbackData) {
        try {
            const response = await this.client.post('/callback', callbackData);
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    async setMultipleCallbacks(callbacks) {
        try {
            const response = await this.client.put('/callback', callbacks);
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    async deleteCallback(callbackId) {
        try {
            const response = await this.client.delete(`/callback/${callbackId}`);
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
    async updateCallback(callbackId, callbackDetails) {
        try {
            const response = await this.client.put(`/callback/${callbackId}`, callbackDetails);
            return this.handleResponse(response);
        }
        catch (error) {
            return this.handleError(error);
        }
    }
}
exports.TedeeLocalApiClient = TedeeLocalApiClient;
//# sourceMappingURL=tedee-local-api-client.js.map