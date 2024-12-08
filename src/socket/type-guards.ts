import type { AddressInfo } from 'net'

export function isAddressInfo(value: AddressInfo | object | undefined): value is AddressInfo {
    return value != null && 'address' in value && 'family' in value && 'port' in value
}
