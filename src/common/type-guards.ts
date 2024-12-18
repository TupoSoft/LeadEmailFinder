import { EMPTY_ARRAY_LENGTH } from './constants'

export function isEmptyArray(value: unknown): value is [] {
    return Array.isArray(value) && value.length === EMPTY_ARRAY_LENGTH
}
