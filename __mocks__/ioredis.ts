import type { Redis as IoRedis } from 'ioredis'
import { jest } from '@jest/globals'

export const Redis: () => IoRedis = jest.fn<typeof Redis.prototype>().mockImplementation(() => ({
    get: jest.fn<typeof Redis.prototype.get>(),
    set: jest.fn<typeof Redis.prototype.set>(),
    eval: jest.fn<typeof Redis.prototype.eval>(),
}))
