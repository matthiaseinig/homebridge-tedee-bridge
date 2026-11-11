import axios, {AxiosError, AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import {createHash} from 'crypto';
import {format} from 'util';
import {CallbackData} from './models/callback-data';
import {createSecretRedactor, describeError} from '../redaction';

interface CustomInternalAxiosRequestConfig extends InternalAxiosRequestConfig {
  retriesCount?: number; // Optional property to track retries
}

const sleep = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

/** JSON for a log line that never throws and stays short. */
function safeStringify(value: unknown, maxLength = 500): string {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text === undefined) {
      return String(value);
    }
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return '[unserializable]';
  }
}

export class TedeeLocalApiClient {
  private client: AxiosInstance;
  private apiKey: string;
  private maxRetries: number;
  private retryDelayMs: number;

  private error: (d) => void;
  private debug: (d) => void;

  constructor(
    ip: string,
    apiKey: string,
    timeout: number = 10000,
    maxRetries: number = 3,
    error?: (d) => void,
    debug?: (d) => void,
    retryDelayMs: number = 500,
  ) {
    this.retryDelayMs = retryDelayMs;
    this.apiKey = apiKey;
    this.maxRetries = maxRetries;
    this.client = axios.create({
      baseURL: 'http://' + ip + '/v1.0',
      headers: {
        accept: 'application/json',
      },
      timeout: timeout,
    });

    // Everything the client reports goes through the redactor, so the key and the api_token
    // never leave the client in a message, even when the bridge reflects request headers.
    const redact = createSecretRedactor(() => [this.apiKey]);
    const errorSink = error ?? ((e) => {
      void (e);
    });
    const debugSink = debug ?? ((e) => {
      void (e);
    });
    this.error = (d) => errorSink(redact(format(d)));
    this.debug = (d) => debugSink(redact(format(d)));

    this.client.interceptors.request.use((config) => this.appendAuthHeader(config));
    this.client.interceptors.response.use((response) => response, (error) => this.handleErrorWithRetry(error));
  }

  private generateApiToken(): string {
    const timestamp = Date.now();
    const hash = createHash('sha256').update(this.apiKey + timestamp).digest('hex');
    return `${hash}${timestamp}`;
  }

  private appendAuthHeader(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    config.headers['api_token'] = this.generateApiToken();
    return config;
  }

  private handleResponse(response) {
    return response.data;
  }

  private handleErrorWithRetry(error: AxiosError) {
    const config = error.config as CustomInternalAxiosRequestConfig;
    if (!config) {
      return Promise.reject(error);
    }

    config.retriesCount = config.retriesCount || 0;

    // Check if we should retry the request
    if (!config || config.retriesCount >= this.maxRetries) {
      return Promise.reject(error);
    }

    this.debug(`Request failed with status code ${error.response?.status}. Retrying...`);
    this.debug(`Retry attempt ${config.retriesCount + 1} of ${this.maxRetries}`);
    // The axios response is circular (it references the request); log status and data only.
    this.debug(`Response status=${error.response?.status} data=${safeStringify(error.response?.data)}`);

    // Increase the retry count
    config.retriesCount += 1;

    return sleep(this.retryDelayMs).then(() => this.client(config));
  }

  private handleError(error) {
    this.error(error.response?.data || error.message);
    // Never dump the whole error: an AxiosError carries the request config, including the api_token header.
    this.debug(describeError(error));
    return Promise.reject(error.response?.data || error.message);
  }

  async getBridgeDetails() {
    try {
      const response = await this.client.get('/bridge');
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async checkApiHealth(): Promise<boolean> {
    try {
      const response = await this.client.get('/bridge');

      // Return false if status is OK but content not to spec
      return response.status === 200 && this.isValidBridgeDetails(response.data);
    } catch (error) {
      return false; // Returns false if the request fails
    }
  }

  // Validation function to check if response matches the BridgeDetails schema
  private isValidBridgeDetails(data): boolean {
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
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getLockById(deviceId: number) {
    try {
      const response = await this.client.get(`/lock/${deviceId}`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async lockDevice(deviceId: number): Promise<void> {
    try {
      const response = await this.client.post(`/lock/${deviceId}/lock`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async unlockDevice(deviceId: number, mode?: number | undefined): Promise<void> {
    if (typeof mode === 'undefined') {
      mode = 4;
    }

    try {
      const response = await this.client.post(`/lock/${deviceId}/unlock`, {
        mode: mode,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async pullDevice(deviceId: number): Promise<void> {
    try {
      const response = await this.client.post(`/lock/${deviceId}/pull`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Callback methods
  async listCallbacks() {
    try {
      const response = await this.client.get('/callback');
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async addCallback(callbackData: CallbackData) {
    try {
      const response = await this.client.post('/callback', callbackData);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async setMultipleCallbacks(callbacks: CallbackData[]) {
    try {
      const response = await this.client.put('/callback', callbacks);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteCallback(callbackId: number): Promise<void> {
    try {
      const response = await this.client.delete(`/callback/${callbackId}`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateCallback(callbackId: number, callbackDetails): Promise<void> {
    try {
      const response = await this.client.put(`/callback/${callbackId}`, callbackDetails);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }
}
