import type { ProxyFvo, ProxyMvo } from './dto'

export type ProxyType = 'http' | 'https' | 'socks4' | 'socks5'

export interface Proxy {
    id: string
    type: ProxyType
    host: string
    port: number
    user?: string
    password?: string
}

export interface ProxyRepository {
    getAll: () => Promise<Proxy[]>
    getById: (id: string) => Promise<Proxy | null>
    save: (proxy: ProxyFvo) => Promise<Proxy>
    update: (id: string, proxy: ProxyMvo) => Promise<Proxy | null>
}
