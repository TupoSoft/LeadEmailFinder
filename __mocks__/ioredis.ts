import type { Redis as IoRedis } from 'ioredis'
import { jest } from '@jest/globals'

export const Redis: () => IoRedis = jest.fn<typeof Redis.prototype>().mockImplementation(() => ({
    eval: jest.fn<typeof Redis.prototype.eval>(),
}))
