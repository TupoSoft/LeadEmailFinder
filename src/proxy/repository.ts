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
    save: (proxy: Proxy) => Promise<Proxy>
    update: (id: string, proxy: Partial<Proxy>) => Promise<Proxy | null>
}
