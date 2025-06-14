export function fromStringToEnum<T extends { [key: string]: string | number }>(
    enumObj: T,
    value: string,
): T[keyof T] | undefined {
    if (value in enumObj) {
        return enumObj[value as keyof T]
    }
    const match = Object.entries(enumObj).find(([, v]) => String(v) === value)
    return match ? enumObj[match[0] as keyof T] : undefined
}
