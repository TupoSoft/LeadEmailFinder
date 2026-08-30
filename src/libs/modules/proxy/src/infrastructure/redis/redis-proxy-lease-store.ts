import { Inject, Injectable } from '@nestjs/common'
import { Redis } from 'ioredis'
import { AcquireLeaseCommand, ProxyLeaseStore } from '../../application/ports/proxy-lease-store'

const RATE_WINDOW_MS = 60_000

const ACQUIRE_LEASE_SCRIPT = `
    local now = tonumber(ARGV[1])
    local leaseTtl = tonumber(ARGV[2])
    local maxConcurrent = tonumber(ARGV[3])
    local proxyRequestsPerMinute = tonumber(ARGV[4])
    local mxRequestsPerMinute = tonumber(ARGV[5])
    local rateWindowTtl = tonumber(ARGV[6])
    local leaseId = ARGV[7]
    local proxyId = ARGV[8]

    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)

    if redis.call('ZCARD', KEYS[1]) >= maxConcurrent then
        return 0
    end

    if tonumber(redis.call('GET', KEYS[2]) or '0') >= proxyRequestsPerMinute then
        return 0
    end

    if tonumber(redis.call('GET', KEYS[3]) or '0') >= mxRequestsPerMinute then
        return 0
    end

    redis.call('ZADD', KEYS[1], now + leaseTtl, leaseId)
    redis.call('PEXPIRE', KEYS[1], leaseTtl)
    redis.call('INCR', KEYS[2])
    redis.call('PEXPIRE', KEYS[2], rateWindowTtl)
    redis.call('INCR', KEYS[3])
    redis.call('PEXPIRE', KEYS[3], rateWindowTtl)
    redis.call('SET', KEYS[4], proxyId, 'PX', leaseTtl)

    return 1
`

const RELEASE_LEASE_SCRIPT = `
    if redis.call('GET', KEYS[2]) == false then
        return 0
    end

    redis.call('DEL', KEYS[2])
    redis.call('ZREM', KEYS[1], ARGV[1])

    return 1
`

@Injectable()
export class RedisProxyLeaseStore implements ProxyLeaseStore {
    constructor(@Inject(Redis) private readonly redis: Redis) {}

    async tryAcquire(command: AcquireLeaseCommand): Promise<boolean> {
        const rateWindowTtl = RATE_WINDOW_MS - (command.now % RATE_WINDOW_MS)
        const [activeLeasesKey, proxyRateKey, mxRateKey, leaseKey] = this.keys(
            command.proxyId,
            command.mxHost,
            command.leaseId,
            command.now,
        )
        const acquired = await this.redis.eval(
            ACQUIRE_LEASE_SCRIPT,
            4,
            activeLeasesKey,
            proxyRateKey,
            mxRateKey,
            leaseKey,
            String(command.now),
            String(command.leaseTtlMs),
            String(command.maxConcurrent),
            String(command.proxyRequestsPerMinute),
            String(command.mxRequestsPerMinute),
            String(rateWindowTtl),
            command.leaseId,
            command.proxyId,
        )

        return Number(acquired) === 1
    }

    async release(proxyId: string, mxHost: string, leaseId: string): Promise<boolean> {
        const [activeLeasesKey, , , leaseKey] = this.keys(proxyId, mxHost, leaseId, Date.now())
        const released = await this.redis.eval(RELEASE_LEASE_SCRIPT, 2, activeLeasesKey, leaseKey, leaseId)

        return Number(released) === 1
    }

    private keys(proxyId: string, mxHost: string, leaseId: string, now: number): [string, string, string, string] {
        const minute = Math.floor(now / RATE_WINDOW_MS)
        const proxyKey = encodeKeyPart(proxyId)
        const mxKey = encodeKeyPart(mxHost)

        return [
            `proxy:leases:${proxyKey}`,
            `proxy:rate:${proxyKey}:${minute}`,
            `proxy:mx-rate:${mxKey}:${minute}`,
            `proxy:lease:${encodeKeyPart(leaseId)}`,
        ]
    }
}

function encodeKeyPart(value: string): string {
    return Buffer.from(value).toString('base64url')
}
