import type { ProxyFVO, ProxyMVO } from './dto'

export type ProxyType = 'http' | 'socks4' | 'socks5'

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
    save: (proxy: ProxyFVO) => Promise<Proxy>
    update: (id: string, proxy: ProxyMVO) => Promise<Proxy | null>
}
