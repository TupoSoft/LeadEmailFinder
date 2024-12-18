import type { Proxy } from './repository'

export type ProxyFvo = Omit<Proxy, 'id'>

export type ProxyMvo = Partial<Omit<Proxy, 'id'>>
