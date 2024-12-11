import type { Proxy } from './repository'

export type ProxyFVO = Omit<Proxy, 'id'>

export type ProxyMVO = Partial<Omit<Proxy, 'id'>>
