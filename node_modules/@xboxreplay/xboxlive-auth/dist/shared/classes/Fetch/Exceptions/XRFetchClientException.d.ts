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
import XRException from '../../XRException';
import type { StringOrError, ErrorData, BaseErrorAttributes } from '../../XRException/XRException.types';
type ErrorAttributes = BaseErrorAttributes<{
    url?: string;
    statusCode?: number;
    response?: Partial<{
        body: any;
        headers: Record<string, string>;
    }>;
}>;
/**
 * XRException class for fetch errors
 */
declare class XRFetchClientException extends XRException<ErrorAttributes> {
    /**
     * Creates a new fetch exception.
     * @param stringOrError - Error message or an Error object to wrap
     * @param data - Additional error data
     */
    constructor(stringOrError: StringOrError, data?: ErrorData<ErrorAttributes>);
    /**
     * Creates an exception from a fetch response
     * @param response - Fetch Response object
     */
    static fromResponse(response: Response): Promise<XRFetchClientException>;
    /**
     * Creates an exception from a network error
     * @param error - Original error that occurred
     * @param url - Request URL if known
     */
    static fromNetworkError(error: Error, url?: string): XRFetchClientException;
}
export default XRFetchClientException;
