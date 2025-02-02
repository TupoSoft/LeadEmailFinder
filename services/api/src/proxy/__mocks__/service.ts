import type { IProxyService } from '../service'
import type { Proxy } from '../repository'
import { jest } from '@jest/globals'
import type { ProxyFvo } from '../dto'

export class ProxyService implements IProxyService {
    getAll: () => Promise<Proxy[]> = jest.fn<typeof ProxyService.prototype.getAll>()
    create: (proxy: ProxyFvo) => Promise<Proxy> = jest.fn<typeof ProxyService.prototype.create>()
}
