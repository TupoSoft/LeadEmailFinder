export function isEmptyArray(value: unknown): value is [] {
    const EMPTY_ARRAY_LENGTH = 0x00

    return Array.isArray(value) && value.length === EMPTY_ARRAY_LENGTH
}
