"use strict";
/**
 * Copyright 2025 Alexis Bize
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_OPTIONS = exports.DEFAULT_TIMEOUT = exports.MAX_TIMEOUT = exports.MIN_TIMEOUT = void 0;
const XRFetchClientException_1 = __importDefault(require("./Exceptions/XRFetchClientException"));
const utils_1 = require("../../modules/utils");
exports.MIN_TIMEOUT = 1000; // 1 second
exports.MAX_TIMEOUT = 30000; // 30 seconds
exports.DEFAULT_TIMEOUT = 10000; // 10 seconds
exports.DEFAULT_OPTIONS = {
    parseJson: true,
    throwOnError: true,
    timeout: exports.DEFAULT_TIMEOUT,
};
/**
 * Base fetch client for making HTTP requests
 * Can be extended for specialized API clients
 */
class XRFetch {
    /**
     * Makes a GET request to an endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {Omit<FetchRequestConfig, 'method' | 'body'>} [config={}] - Request config excluding method and body
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     */
    static async get(url, init = {}) {
        return this.fetch(url, { ...init, method: 'GET' });
    }
    /**
     * Makes a POST request to an endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {any} [body] - The request body (will be automatically stringified if an object)
     * @param {Omit<FetchRequestConfig, 'method' | 'body'>} [init={}] - Request config excluding method and body
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     */
    static async post(url, body, init = {}) {
        return this.fetch(url, { ...init, method: 'POST', body });
    }
    /**
     * Makes a PUT request to an endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {any} [body] - The request body (will be automatically stringified if an object)
     * @param {Omit<FetchRequestConfig, 'method' | 'body'>} [config={}] - Request config excluding method and body
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     */
    static async put(url, body, init = {}) {
        return this.fetch(url, { ...init, method: 'PUT', body });
    }
    /**
     * Makes a DELETE request to an endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {Omit<FetchRequestConfig, 'method'>} [init={}] - Request config excluding method
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     */
    static async delete(url, init = {}) {
        return this.fetch(url, { ...init, method: 'DELETE' });
    }
    /**
     * Runs a fetch request
     * @template T - The expected response data type
     * @param {string} url - The URL to request
     * @param {FetchRequestConfig} [config={}] - Fetch options
     * @returns {Promise<FetchResponse<T>>} Promise resolving to the response data
     * @throws {FetchClientException} If the request fails
     */
    static async fetch(url, config = {}) {
        const options = this.mergeOptions(config.options);
        const timeout = this.calculateTimeout(options.timeout);
        const headers = this.createHeaders(config);
        if (options.additionalHeaders !== void 0) {
            Object.entries(options.additionalHeaders).forEach(([key, value]) => {
                headers.set(key, value);
            });
        }
        const processedBody = this.processBody(config.body);
        delete config.options;
        const resp = await this.performFetch(url, {
            ...config,
            headers,
            body: processedBody,
            signal: timeout !== void 0 ? AbortSignal.timeout(timeout) : void 0,
        }).catch(err => {
            throw this.createErrorFromNetworkError(err, url);
        });
        const responseHeaders = this.extractHeaders(resp);
        if (options.throwOnError === true && resp.ok === false) {
            if (resp.status >= 300 && resp.status < 400) {
                return this.createResponse(null, resp, responseHeaders);
            }
            else
                throw await this.createErrorFromResponse(resp);
        }
        const data = await this.parseResponseData(resp, options).catch(err => {
            throw new XRFetchClientException_1.default(err);
        });
        return this.createResponse(data, resp, responseHeaders);
    }
    /**
     * Merges provided options with defaults
     * @param {FetchRequestConfig['options']} [options={}] - The options to merge
     * @returns {FetchRequestConfig['options']} Merged options
     * @protected
     */
    static mergeOptions(options = {}) {
        return { ...exports.DEFAULT_OPTIONS, ...options };
    }
    /**
     * Creates headers for the request
     * @param {FetchRequestConfig} config - The request config
     * @returns {Headers} The headers object
     * @protected
     */
    static createHeaders(config) {
        const headers = new Headers(config.headers);
        if (config.options?.includeDefaultHeaders !== false) {
            headers.set('Accept', headers.get('Accept') || '*/*');
            headers.set('Accept-Language', headers.get('Accept-Language') || 'en-US,en;q=0.9');
            headers.set('Cache-Control', headers.get('Cache-Control') || 'no-cache');
            headers.set('Accept-Encoding', headers.get('Accept-Encoding') || 'gzip, deflate, br');
            headers.set('User-Agent', headers.get('User-Agent') || this.USER_AGENT);
        }
        if ((0, utils_1.isObject)(config.body) === true) {
            headers.set('Content-Type', 'application/json');
        }
        return headers;
    }
    /**
     * Processes the request body
     * @param {any} body - The request body
     * @returns {any} The processed body
     * @protected
     */
    static processBody(body) {
        if ((0, utils_1.isObject)(body) === true) {
            return JSON.stringify(body);
        }
        else
            return body;
    }
    /**
     * Calculates the appropriate timeout value
     * @param {number} [timeout] - The provided timeout
     * @returns {number|undefined} The calculated timeout
     * @protected
     */
    static calculateTimeout(timeout) {
        if (timeout !== void 0) {
            return Math.max(exports.MIN_TIMEOUT, Math.min(exports.MAX_TIMEOUT, timeout));
        }
        else
            return void 0;
    }
    /**
     * Performs the actual fetch request
     * @param {string} url - The URL to fetch
     * @param {RequestInit} init - The fetch request config
     * @returns {Promise<Response>} The fetch response
     * @protected
     */
    static async performFetch(url, init) {
        return fetch(url, init);
    }
    /**
     * Extracts headers from the response
     * @param {Response} response - The fetch response
     * @returns {Record<string, string>} The headers as an object
     * @protected
     */
    static extractHeaders(response) {
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'set-cookie') {
                if (responseHeaders[key]) {
                    responseHeaders[key] += ',' + value;
                }
                else
                    responseHeaders[key] = value;
            }
            else
                responseHeaders[key] = value;
        });
        return responseHeaders;
    }
    /**
     * Creates an error from a failed response
     * @param {Response} response - The fetch response
     * @returns {Promise<FetchClientException>} The created error
     * @protected
     */
    static async createErrorFromResponse(response) {
        return XRFetchClientException_1.default.fromResponse(response);
    }
    /**
     * Creates an error from a network error
     * @param {any} error - The original error
     * @param {string} url - The request URL
     * @returns {FetchClientException} The created error
     * @protected
     */
    static createErrorFromNetworkError(error, url) {
        return XRFetchClientException_1.default.fromNetworkError(error instanceof Error ? error : new Error(String(error)), url);
    }
    /**
     * Parses the response data based on content type
     * @template T - The expected data type
     * @param {Response} response - The fetch response
     * @param {FetchRequestConfig['options']} [options={}] - The fetch options
     * @returns {Promise<T>} The parsed data
     * @protected
     */
    static async parseResponseData(response, options = {}) {
        const data = options.parseJson === true && response.status !== 204 ? await response.json() : await response.text();
        return data;
    }
    /**
     * Creates the final response object
     * @template T - The expected data type
     * @param {T} data - The response data
     * @param {Response} response - The original fetch response
     * @param {Record<string, string>} headers - The extracted headers
     * @returns {FetchResponse<T>} The final response object
     * @protected
     */
    static createResponse(data, response, headers) {
        return { data, response, headers, statusCode: response.status };
    }
}
/**
 * Default user agent used during requests
 */
XRFetch.USER_AGENT = 'XboxLive-Auth/5.0 (Node; +https://github.com/XboxReplay/xboxlive-auth) XboxReplay/AuthClient';
exports.default = XRFetch;
