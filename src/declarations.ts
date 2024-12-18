import type { Result } from 'ioredis'

declare module 'ioredis' {
    interface RedisCommander<Context> {
        incrementConnection: (key: string, target: string, limit: number, ttl: number) => Result<number, Context>
        decrementConnection: (key: string, target: string, ttl: number) => Result<number, Context>
    }
}
