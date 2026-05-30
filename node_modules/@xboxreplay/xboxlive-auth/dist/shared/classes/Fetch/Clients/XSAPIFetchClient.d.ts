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
import XRFetch from '..';
import type { FetchResponse } from '../Fetch.types';
import type { XSAPIFetchRequestConfig } from './XSAPIFetchClient.types';
/**
 * Specialized fetch client for Xbox Network API requests
 * Extends the base FetchClient with Xbox-specific functionality
 */
declare class XSAPIFetchClient extends XRFetch {
    /**
     * Makes a GET request to an Xbox Network API endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {Omit<XSAPIFetchRequestConfig, 'method' | 'body'>} [config={}] - Request config excluding method and body
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     *
     * @example
     * const response = await XSAPIFetchClient.get('https://xbl.xboxlive.com/resource');
     */
    static get<T = any>(url: string, config?: Omit<XSAPIFetchRequestConfig, 'method' | 'body'>): Promise<FetchResponse<T>>;
    /**
     * Makes a POST request to an Xbox Network API endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {any} [body] - The request body (will be automatically stringified if an object)
     * @param {Omit<XSAPIFetchRequestConfig, 'method' | 'body'>} [config={}] - Request config excluding method and body
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     *
     * @example
     * const response = await XSAPIFetchClient.post('https://service.xboxlive.com/resource', { foo: 'bar' });
     */
    static post<T = any>(url: string, body?: any, config?: Omit<XSAPIFetchRequestConfig, 'method' | 'body'>): Promise<FetchResponse<T>>;
    /**
     * Makes a PUT request to an Xbox Network API endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {any} [body] - The request body (will be automatically stringified if an object)
     * @param {Omit<XSAPIFetchRequestConfig, 'method' | 'body'>} [config={}] - Request config excluding method and body
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     *
     * @example
     * const response = await XSAPIFetchClient.put('https://service.xboxlive.com/resource', { foo: 'bar' });
     */
    static put<T = any>(url: string, body?: any, config?: Omit<XSAPIFetchRequestConfig, 'method' | 'body'>): Promise<FetchResponse<T>>;
    /**
     * Makes a DELETE request to an Xbox Network API endpoint
     * @template T - The expected response data type
     * @param {string} url - The URL to make the request to
     * @param {Omit<XSAPIFetchRequestConfig, 'method'>} [config={}] - Request config excluding method
     * @returns {Promise<FetchResponse<T>>} A promise that resolves to the response data
     * @throws {FetchClientException} If the request fails
     *
     * @example
     * const response = await XSAPIFetchClient.delete('https://service.xboxlive.com/resource');
     */
    static delete<T = any>(url: string, config?: Omit<XSAPIFetchRequestConfig, 'method'>): Promise<FetchResponse<T>>;
    /**
     * Merges provided options with defaults, adding Xbox-specific defaults
     * @param {XSAPIFetchRequestConfig["options"]} [options={}] - The options to merge
     * @returns {XSAPIFetchRequestConfig["options"]} Merged options
     * @protected
     */
    protected static mergeOptions(options?: XSAPIFetchRequestConfig['options']): NonNullable<XSAPIFetchRequestConfig['options']>;
    /**
     * Creates headers for the request, adding Xbox-specific headers
     * @param {XSAPIFetchRequestConfig} config - The request config
     * @returns {Headers} The headers object
     * @protected
     */
    protected static createHeaders(config: XSAPIFetchRequestConfig): Headers;
}
export default XSAPIFetchClient;
