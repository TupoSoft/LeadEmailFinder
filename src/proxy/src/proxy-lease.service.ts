import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Redis } from 'ioredis'
import { randomUUID } from 'node:crypto'

const DEFAULT_MX_REQUESTS_PER_MINUTE = 10
const DEFAULT_LEASE_TTL_MS = 60_000
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

export interface ProxyLeaseRequest {
    proxyId: string
    mxHost: string
    maxConcurrent: number
    requestsPerMinute: number
}

export interface ProxyLease {
    id: string
    proxyId: string
    mxHost: string
    expiresAt: Date
}

@Injectable()
export class ProxyLeaseService {
    private readonly mxRequestsPerMinute: number
    private readonly leaseTtlMs: number

    constructor(
        @Inject(Redis)
        private readonly redis: Redis,
        configService: ConfigService,
    ) {
        this.mxRequestsPerMinute = configService.get<number>('PROXY_MX_REQUESTS_PER_MINUTE') ?? DEFAULT_MX_REQUESTS_PER_MINUTE
        this.leaseTtlMs = configService.get<number>('PROXY_LEASE_TTL_MS') ?? DEFAULT_LEASE_TTL_MS
    }

    async acquire(request: ProxyLeaseRequest): Promise<ProxyLease | undefined> {
        const now = Date.now()
        const leaseId = randomUUID()
        const rateWindowTtl = RATE_WINDOW_MS - (now % RATE_WINDOW_MS)
        const [activeLeasesKey, proxyRateKey, mxRateKey, leaseKey] = this.keys(request.proxyId, request.mxHost, leaseId, now)
        const acquired = await this.redis.eval(
            ACQUIRE_LEASE_SCRIPT,
            4,
            activeLeasesKey,
            proxyRateKey,
            mxRateKey,
            leaseKey,
            String(now),
            String(this.leaseTtlMs),
            String(request.maxConcurrent),
            String(request.requestsPerMinute),
            String(this.mxRequestsPerMinute),
            String(rateWindowTtl),
            leaseId,
            request.proxyId,
        )

        if (Number(acquired) !== 1) {
            return undefined
        }

        return {
            id: leaseId,
            proxyId: request.proxyId,
            mxHost: request.mxHost,
            expiresAt: new Date(now + this.leaseTtlMs),
        }
    }

    async release(lease: ProxyLease): Promise<boolean> {
        const [activeLeasesKey, , , leaseKey] = this.keys(lease.proxyId, lease.mxHost, lease.id, Date.now())
        const released = await this.redis.eval(RELEASE_LEASE_SCRIPT, 2, activeLeasesKey, leaseKey, lease.id)

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
