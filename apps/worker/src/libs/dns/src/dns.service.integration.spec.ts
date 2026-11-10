import { Resolver } from 'node:dns/promises'
import { DnsService } from './dns.service'

jest.mock('node:dns/promises', () => ({ Resolver: jest.fn() }))

describe('DnsService worker contract', () => {
    const resolveMx = jest.fn()
    const cancel = jest.fn()
    let resolver: DnsService

    beforeEach(() => {
        jest.resetAllMocks()
        jest.mocked(Resolver).mockImplementation(() => ({ resolveMx, cancel }) as unknown as Resolver)
        resolver = new DnsService()
    })

    it('uses priority order, domain normalization, and worker-local caching', async () => {
        resolveMx.mockResolvedValueOnce([
            { exchange: 'mx2.example.com', priority: 20 },
            { exchange: 'mx1.example.com', priority: 10 },
        ])
        await expect(resolver.resolve('EXAMPLE.COM', 'MX')).resolves.toEqual([
            { exchange: 'mx1.example.com', priority: 10 },
            { exchange: 'mx2.example.com', priority: 20 },
        ])
        expect(resolveMx).toHaveBeenCalledWith('example.com')
        expect(resolveMx).toHaveBeenCalledTimes(1)
    })

    it('returns cached exchange order without another DNS request', async () => {
        resolveMx.mockResolvedValueOnce([{ exchange: 'cached.example.com', priority: 10 }])
        await resolver.resolve('example.com', 'MX')
        await expect(resolver.resolve('example.com', 'MX')).resolves.toEqual([
            { exchange: 'cached.example.com', priority: 10 },
        ])
        expect(resolveMx).toHaveBeenCalledTimes(1)
    })

    it.each(['ENODATA', 'ENOTFOUND', 'ETIMEOUT', 'SERVFAIL'])(
        'maps authoritative absence but preserves retryable DNS failure for %s',
        async code => {
            const error = Object.assign(new Error('remote DNS sentinel'), { code })
            resolveMx.mockRejectedValueOnce(error)
            if (code === 'ENODATA' || code === 'ENOTFOUND') {
                await expect(resolver.resolve('example.com', 'MX')).resolves.toEqual([])
            } else {
                await expect(resolver.resolve('example.com', 'MX')).rejects.toBe(error)
            }
            expect(resolveMx).toHaveBeenCalledTimes(1)
            expect(cancel).toHaveBeenCalledTimes(1)
        },
    )

    it.each(['before lookup', 'in flight', 'after another query'])(
        'cancels %s without caching a canceled answer or affecting another resolver',
        async phase => {
            const controller = new AbortController()
            const firstCancel = jest.fn()
            const secondCancel = jest.fn()
            let rejectFirst: (error: Error) => void = () => {
                throw new Error('query_not_started')
            }
            let resolveFirst: (records: { exchange: string; priority: number }[]) => void = () => {
                throw new Error('query_not_started')
            }
            const firstLookup = jest.fn(
                () =>
                    new Promise<{ exchange: string; priority: number }[]>((resolve, reject) => {
                        rejectFirst = reject
                        resolveFirst = resolve
                    }),
            )
            firstCancel.mockImplementation(() =>
                rejectFirst(Object.assign(new Error('canceled'), { code: 'ECANCELLED' })),
            )
            const secondLookup = jest.fn().mockResolvedValue([{ exchange: 'other.example.com', priority: 10 }])
            jest.mocked(Resolver)
                .mockImplementationOnce(() => ({ resolveMx: firstLookup, cancel: firstCancel }) as unknown as Resolver)
                .mockImplementationOnce(
                    () => ({ resolveMx: secondLookup, cancel: secondCancel }) as unknown as Resolver,
                )
            if (phase === 'before lookup') {
                controller.abort()
                await expect(resolver.resolve('example.com', 'MX', controller.signal)).rejects.toMatchObject({
                    name: 'AbortError',
                })
                expect(firstLookup).not.toHaveBeenCalled()
                return
            }

            const first = resolver.resolve('example.com', 'MX', controller.signal)
            const assertion = expect(first).rejects.toBeDefined()

            await expect(resolver.resolve('other.example.com', 'MX')).resolves.toEqual([
                { exchange: 'other.example.com', priority: 10 },
            ])

            if (phase === 'after another query') {
                resolveFirst([{ exchange: 'mail.example.com', priority: 10 }])
            }

            controller.abort()
            await assertion

            expect(secondLookup).toHaveBeenCalledTimes(1)
            expect(secondCancel).toHaveBeenCalledTimes(1)

            // The canceled first answer must never populate the cache.
            resolveMx.mockResolvedValueOnce([{ exchange: 'fresh.example.com', priority: 10 }])
            await expect(resolver.resolve('example.com', 'MX')).resolves.toEqual([
                { exchange: 'fresh.example.com', priority: 10 },
            ])
        },
    )
})
