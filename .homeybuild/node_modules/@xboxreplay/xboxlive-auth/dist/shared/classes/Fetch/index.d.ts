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
import FetchClientException from './Exceptions/XRFetchClientException';
import type { FetchRequestConfig, FetchResponse } from './Fetch.types';
export declare const MIN_TIMEOUT = 1000;
export declare const MAX_TIMEOUT = 30000;
export declare const DEFAULT_TIMEOUT = 10000;
export declare const DEFAULT_OPTIONS: Partial<FetchRequestConfig['options']>;
/**
 * Base fetch client for making HTTP requests
 * Can be extended for specialized API clients
 */
declare abstract class XRFetch {
    /**
     * Default user agent used during requests
     */
    protected static USER_AGENT: string;
    /**
     * Makes a GET request to an endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {Omit<FetchRequestConfig, 'method' | 'body'>} [config={}] - Request config excluding method and body
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     */
    static get<T = any>(url: string, init?: Omit<FetchRequestConfig, 'method' | 'body'>): Promise<FetchResponse<T>>;
    /**
     * Makes a POST request to an endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {any} [body] - The request body (will be automatically stringified if an object)
     * @param {Omit<FetchRequestConfig, 'method' | 'body'>} [init={}] - Request config excluding method and body
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     */
    static post<T = any>(url: string, body?: any, init?: Omit<FetchRequestConfig, 'method' | 'body'>): Promise<FetchResponse<T>>;
    /**
     * Makes a PUT request to an endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {any} [body] - The request body (will be automatically stringified if an object)
     * @param {Omit<FetchRequestConfig, 'method' | 'body'>} [config={}] - Request config excluding method and body
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     */
    static put<T = any>(url: string, body?: any, init?: Omit<FetchRequestConfig, 'method' | 'body'>): Promise<FetchResponse<T>>;
    /**
     * Makes a DELETE request to an endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {Omit<FetchRequestConfig, 'method'>} [init={}] - Request config excluding method
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     */
    static delete<T = any>(url: string, init?: Omit<FetchRequestConfig, 'method'>): Promise<FetchResponse<T>>;
    /**
     * Runs a fetch request
     * @template T - The expected response data type
     * @param {string} url - The URL to request
     * @param {FetchRequestConfig} [config={}] - Fetch options
     * @returns {Promise<FetchResponse<T>>} Promise resolving to the response data
     * @throws {FetchClientException} If the request fails
     */
    static fetch<T = any>(url: string, config?: FetchRequestConfig): Promise<FetchResponse<T>>;
    /**
     * Merges provided options with defaults
     * @param {FetchRequestConfig['options']} [options={}] - The options to merge
     * @returns {FetchRequestConfig['options']} Merged options
     * @protected
     */
    protected static mergeOptions(options?: FetchRequestConfig['options']): NonNullable<FetchRequestConfig['options']>;
    /**
     * Creates headers for the request
     * @param {FetchRequestConfig} config - The request config
     * @returns {Headers} The headers object
     * @protected
     */
    protected static createHeaders(config: FetchRequestConfig): Headers;
    /**
     * Processes the request body
     * @param {any} body - The request body
     * @returns {any} The processed body
     * @protected
     */
    protected static processBody(body: any): any;
    /**
     * Calculates the appropriate timeout value
     * @param {number} [timeout] - The provided timeout
     * @returns {number|undefined} The calculated timeout
     * @protected
     */
    protected static calculateTimeout(timeout?: number): number | undefined;
    /**
     * Performs the actual fetch request
     * @param {string} url - The URL to fetch
     * @param {RequestInit} init - The fetch request config
     * @returns {Promise<Response>} The fetch response
     * @protected
     */
    protected static performFetch(url: string, init: RequestInit): Promise<Response>;
    /**
     * Extracts headers from the response
     * @param {Response} response - The fetch response
     * @returns {Record<string, string>} The headers as an object
     * @protected
     */
    protected static extractHeaders(response: Response): Record<string, string>;
    /**
     * Creates an error from a failed response
     * @param {Response} response - The fetch response
     * @returns {Promise<FetchClientException>} The created error
     * @protected
     */
    protected static createErrorFromResponse(response: Response): Promise<FetchClientException>;
    /**
     * Creates an error from a network error
     * @param {any} error - The original error
     * @param {string} url - The request URL
     * @returns {FetchClientException} The created error
     * @protected
     */
    protected static createErrorFromNetworkError(error: any, url: string): FetchClientException;
    /**
     * Parses the response data based on content type
     * @template T - The expected data type
     * @param {Response} response - The fetch response
     * @param {FetchRequestConfig['options']} [options={}] - The fetch options
     * @returns {Promise<T>} The parsed data
     * @protected
     */
    protected static parseResponseData<T>(response: Response, options?: FetchRequestConfig['options']): Promise<T>;
    /**
     * Creates the final response object
     * @template T - The expected data type
     * @param {T} data - The response data
     * @param {Response} response - The original fetch response
     * @param {Record<string, string>} headers - The extracted headers
     * @returns {FetchResponse<T>} The final response object
     * @protected
     */
    protected static createResponse<T>(data: T, response: Response, headers: Record<string, string>): FetchResponse<T>;
}
export default XRFetch;
