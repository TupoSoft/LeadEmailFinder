import type { ProxyType } from './repository'

export interface ProxyFvo {
    type: ProxyType
    host: string
    port: number
    user?: string
    password?: string
}

export interface ProxyMvo extends Partial<ProxyFvo> {
    blacklistsToAdd?: string[]
    blacklistsToRemove?: string[]
}
