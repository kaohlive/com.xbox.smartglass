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
import type { BaseErrorAttributes, ErrorAttributes, ErrorData, StringOrError } from './XRException.types';
/**
 * Custom exception class for the library with support for structured error data and attributes.
 * @template TAttributes Type for custom error attributes.
 */
declare class XRBaseException<TAttributes extends BaseErrorAttributes = BaseErrorAttributes> extends Error {
    /**
     * Structured error data containing optional attributes.
     */
    readonly data: ErrorData<TAttributes>;
    /**
     * Creates a new XRBaseException.
     * @param stringOrError - Error message or an Error object to wrap.
     * @param data - Optional additional error data.
     */
    constructor(stringOrError: StringOrError, data?: ErrorData<TAttributes>);
    /**
     * Gets the error attributes.
     * @returns Current error attributes.
     */
    getAttributes(): ErrorAttributes<TAttributes>;
    /**
     * Extends the current attributes with new ones.
     * @param attributes - Partial attributes to add.
     * @returns This instance for chaining.
     */
    extendAttributes(attributes: Partial<TAttributes>): this;
    /**
     * Creates a JSON representation of the error.
     * @returns Object with message and data properties.
     */
    toJSON(): {
        message: string;
        data: ErrorData<TAttributes>;
        name: string;
    };
    /**
     * Creates a copy of the exception with a new message.
     * @param message - New error message.
     */
    withMessage(message: string): XRBaseException<TAttributes>;
    /**
     * Factory method to create an exception from any error.
     * @param err - Error to convert to an XRBaseException.
     * @param defaultMessage - Optional message to use if the error doesn't have one.
     * @example
     * const ex = XRBaseException.from(new Error('fail'));
     */
    static from<T extends BaseErrorAttributes>(err: unknown, defaultMessage?: string): XRBaseException<T>;
}
export default XRBaseException;
