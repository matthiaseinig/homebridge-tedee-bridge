import { CallbackData } from './models/callback-data';
export declare class TedeeLocalApiClient {
    private client;
    private apiKey;
    private maxRetries;
    private error;
    private debug;
    constructor(ip: string, apiKey: string, timeout?: number, maxRetries?: number, error?: (d: any) => void, debug?: (d: any) => void);
    private generateApiToken;
    private appendAuthHeader;
    private handleResponse;
    private handleErrorWithRetry;
    private handleError;
    getBridgeDetails(): Promise<any>;
    checkApiHealth(): Promise<boolean>;
    private isValidBridgeDetails;
    getLockList(): Promise<any>;
    getLockById(deviceId: number): Promise<any>;
    lockDevice(deviceId: number): Promise<void>;
    unlockDevice(deviceId: number, mode?: number | undefined): Promise<void>;
    pullDevice(deviceId: number): Promise<void>;
    listCallbacks(): Promise<any>;
    addCallback(callbackData: CallbackData): Promise<any>;
    setMultipleCallbacks(callbacks: CallbackData[]): Promise<any>;
    deleteCallback(callbackId: number): Promise<void>;
    updateCallback(callbackId: number, callbackDetails: any): Promise<void>;
}
//# sourceMappingURL=tedee-local-api-client.d.ts.map