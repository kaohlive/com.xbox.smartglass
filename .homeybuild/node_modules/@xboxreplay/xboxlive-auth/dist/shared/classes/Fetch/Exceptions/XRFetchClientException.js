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
const XRException_1 = __importDefault(require("../../XRException"));
/**
 * XRException class for fetch errors
 */
class XRFetchClientException extends XRException_1.default {
    /**
     * Creates a new fetch exception.
     * @param stringOrError - Error message or an Error object to wrap
     * @param data - Additional error data
     */
    constructor(stringOrError, data = {}) {
        super(stringOrError, data);
        this.name = this.constructor.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
    /**
     * Creates an exception from a fetch response
     * @param response - Fetch Response object
     */
    static async fromResponse(response) {
        // prettier-ignore
        const responseBody = await response.clone().json().catch(() => response.clone().text().catch(() => null));
        return new XRFetchClientException(response.statusText, {
            attributes: {
                code: 'REQUEST_ERROR',
                extra: {
                    url: response.url,
                    statusCode: response.status,
                    response: {
                        body: responseBody,
                        headers: Object.fromEntries(response.headers.entries()),
                    },
                },
            },
        });
    }
    /**
     * Creates an exception from a network error
     * @param error - Original error that occurred
     * @param url - Request URL if known
     */
    static fromNetworkError(error, url) {
        return new XRFetchClientException(error, {
            attributes: { code: 'NETWORK_ERROR', extra: { url } },
        });
    }
}
exports.default = XRFetchClientException;
