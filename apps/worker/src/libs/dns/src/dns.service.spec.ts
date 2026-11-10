import { Resolver } from 'node:dns/promises'
import { performance } from 'node:perf_hooks'
import { DnsService } from './dns.service'
import { DNSTypeMap } from './util'

jest.mock('node:dns/promises', () => ({
    Resolver: jest.fn(),
}))

describe('DnsService', () => {
    const resolveMx = jest.fn()
    const reverse = jest.fn()
    const resolve4 = jest.fn()
    const resolve6 = jest.fn()
    const cancel = jest.fn()

    let dnsService: DnsService

    beforeEach(() => {
        jest.resetAllMocks()

        jest.useFakeTimers().setSystemTime(new Date('2026-11-10T00:00:00.000Z'))
        jest.spyOn(performance, 'now').mockImplementation(() => Date.now())

        jest.mocked(Resolver).mockImplementation(
            () =>
                ({
                    resolveMx,
                    reverse,
                    resolve4,
                    resolve6,
                    cancel,
                }) as unknown as Resolver,
        )

        dnsService = new DnsService()
    })

    afterEach(() => {
        jest.restoreAllMocks()
        jest.useRealTimers()
    })

    it('returns cached records without exposing mutable cached arrays', async () => {
        const records: DNSTypeMap['MX'] = [{ exchange: 'mail.example.com', priority: 10 }]
        resolveMx.mockResolvedValueOnce(records)

        const firstResult = await dnsService.resolve('EXAMPLE.COM', 'MX')
        firstResult.push({ exchange: 'caller-change.example.com', priority: 20 })

        await expect(dnsService.resolve('example.com', 'MX')).resolves.toEqual([
            { exchange: 'mail.example.com', priority: 10 },
        ])
        expect(resolveMx).toHaveBeenCalledTimes(1)
        expect(resolveMx).toHaveBeenCalledWith('example.com')
    })

    it('fetches and caches records until the configured seconds-based TTL expires', async () => {
        const ttlMilliseconds = DnsService.DEFAULT_TTL_SECONDS * 1000
        resolveMx.mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }])

        await dnsService.resolve('example.com', 'MX')

        jest.advanceTimersByTime(ttlMilliseconds - 1)
        await dnsService.resolve('example.com', 'MX')

        expect(resolveMx).toHaveBeenCalledTimes(1)

        jest.advanceTimersByTime(2)
        await dnsService.resolve('example.com', 'MX')

        expect(resolveMx).toHaveBeenCalledTimes(2)
    })

    it('uses reverse lookup for PTR records', async () => {
        reverse.mockResolvedValueOnce(['example.com'])

        await expect(dnsService.resolve('192.0.2.1', 'PTR')).resolves.toEqual(['example.com'])
        expect(reverse).toHaveBeenCalledWith('192.0.2.1')
    })

    it('keeps cached record types independent', async () => {
        const ipv4Records = ['93.184.216.34']
        const ipv6Records = ['2606:2800:220:1:248:1893:25c8:1946']

        resolve4.mockResolvedValueOnce(ipv4Records)
        resolve6.mockResolvedValueOnce(ipv6Records)

        await expect(dnsService.resolve('example.com', 'A')).resolves.toEqual(ipv4Records)
        await expect(dnsService.resolve('example.com', 'AAAA')).resolves.toEqual(ipv6Records)

        await dnsService.resolve('example.com', 'A')
        await dnsService.resolve('example.com', 'AAAA')

        expect(resolve4).toHaveBeenCalledTimes(1)
        expect(resolve6).toHaveBeenCalledTimes(1)
    })

    it('rejects an already canceled lookup before opening a resolver or returning cached data', async () => {
        resolveMx.mockResolvedValueOnce([{ exchange: 'mail.example.com', priority: 10 }])

        await dnsService.resolve('example.com', 'MX')

        const controller = new AbortController()
        controller.abort()

        await expect(dnsService.resolve('example.com', 'MX', controller.signal)).rejects.toMatchObject({
            name: 'AbortError',
        })
        expect(Resolver).toHaveBeenCalledTimes(1)
    })

    it('evicts the least recently used cache entry when capacity is reached', async () => {
        dnsService = new DnsService(60, 2)
        resolve4.mockResolvedValue(['93.184.216.34'])

        await dnsService.resolve('one.example.com', 'A')
        await dnsService.resolve('two.example.com', 'A')

        await dnsService.resolve('one.example.com', 'A')

        await dnsService.resolve('three.example.com', 'A')

        await dnsService.resolve('two.example.com', 'A')

        const requestedDomains = resolve4.mock.calls.map(([name]) => String(name))

        expect(requestedDomains).toEqual([
            'one.example.com',
            'two.example.com',
            'three.example.com',
            'two.example.com',
        ])
    })
})
