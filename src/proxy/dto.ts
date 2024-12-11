import type { Proxy } from './repository'

export type ProxyFVO = Proxy & {
    id?: string
}

export type ProxyMVO = Partial<Omit<Proxy, 'id'>>
