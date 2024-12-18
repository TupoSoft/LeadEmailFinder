import type { Redis as IoRedis } from 'ioredis'
import { jest } from '@jest/globals'

export const Redis: () => IoRedis = jest.fn<typeof Redis.prototype>().mockImplementation(() => ({
    get: jest.fn<typeof Redis.prototype.get>(),
    set: jest.fn<typeof Redis.prototype.set>(),
    incrementConnection: jest.fn<typeof Redis.prototype.incrementConnection>(),
    decrementConnection: jest.fn<typeof Redis.prototype.decrementConnection>(),
    defineCommand: jest.fn<typeof Redis.prototype.defineCommand>(),
}))
