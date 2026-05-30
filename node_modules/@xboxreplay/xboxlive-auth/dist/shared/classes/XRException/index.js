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
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../../modules/utils");
/**
 * Custom exception class for the library with support for structured error data and attributes.
 * @template TAttributes Type for custom error attributes.
 */
class XRBaseException extends Error {
    /**
     * Creates a new XRBaseException.
     * @param stringOrError - Error message or an Error object to wrap.
     * @param data - Optional additional error data.
     */
    constructor(stringOrError, data = {}) {
        super(typeof stringOrError === 'string' ? stringOrError : stringOrError.message);
        // Maintain proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, new.target.prototype);
        // Set the correct name
        this.name = this.constructor.name;
        // Capture stack trace if available
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        // Initialize data with attributes
        this.data = { ...data };
        // Handle case when an Error object is passed
        if (stringOrError instanceof Error) {
            const attributes = (this.data.attributes || {});
            this.data.attributes = {
                ...attributes,
                _originalError: stringOrError,
                // Preserve original stack if available
                ...(stringOrError.stack ? { _originalStack: stringOrError.stack } : {}),
            };
            // Copy any additional properties from the original error
            const originalErrorProps = Object.getOwnPropertyNames(stringOrError).filter(prop => !['name', 'message', 'stack'].includes(prop));
            for (const prop of originalErrorProps) {
                const value = stringOrError[prop];
                this.data.attributes[`_original_${prop}`] = value;
            }
        }
    }
    /**
     * Gets the error attributes.
     * @returns Current error attributes.
     */
    getAttributes() {
        return (this.data.attributes || {});
    }
    /**
     * Extends the current attributes with new ones.
     * @param attributes - Partial attributes to add.
     * @returns This instance for chaining.
     */
    extendAttributes(attributes) {
        this.data.attributes = {
            ...(this.data.attributes || {}),
            ...attributes,
        };
        return this;
    }
    /**
     * Creates a JSON representation of the error.
     * @returns Object with message and data properties.
     */
    toJSON() {
        return { name: this.name, message: this.message, data: this.data };
    }
    /**
     * Creates a copy of the exception with a new message.
     * @param message - New error message.
     */
    withMessage(message) {
        return new XRBaseException(message, this.data);
    }
    /**
     * Factory method to create an exception from any error.
     * @param err - Error to convert to an XRBaseException.
     * @param defaultMessage - Optional message to use if the error doesn't have one.
     * @example
     * const ex = XRBaseException.from(new Error('fail'));
     */
    static from(err, defaultMessage = 'An unknown error occurred') {
        if (err instanceof XRBaseException) {
            return err;
        }
        else if (err instanceof Error) {
            return new XRBaseException(err);
        }
        // Handle non-Error objects
        if ((0, utils_1.isObject)(err) === true) {
            const errorObj = err;
            const message = typeof errorObj.message === 'string' ? errorObj.message : defaultMessage;
            return new XRBaseException(message, {
                attributes: { _originalError: err },
            });
        }
        // Handle primitives
        return new XRBaseException(defaultMessage, {
            attributes: { _originalError: err },
        });
    }
}
exports.default = XRBaseException;
