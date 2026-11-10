import { Resolver } from 'node:dns/promises'
import { DNSTypeMap, fetchMxRecords, fetchRecords } from './util'

jest.mock('node:dns/promises', () => ({ Resolver: jest.fn() }))

describe('DNS Utilities', () => {
    const resolveMx = jest.fn()
    const reverse = jest.fn()
    const cancel = jest.fn()

    beforeEach(() => {
        jest.resetAllMocks()
        jest.mocked(Resolver).mockImplementation(() => ({ resolveMx, reverse, cancel }) as unknown as Resolver)
    })

    describe('fetchRecords', () => {
        it('fetches MX records with a bounded resolver', async () => {
            const mxRecords: DNSTypeMap['MX'] = [{ exchange: 'mail.example.com', priority: 10 }]
            resolveMx.mockResolvedValueOnce(mxRecords)
            await expect(fetchRecords('example.com', 'MX')).resolves.toEqual(mxRecords)
            expect(resolveMx).toHaveBeenCalledWith('example.com')
            expect(Resolver).toHaveBeenCalledWith({ timeout: 10_000, tries: 1 })
            expect(cancel).toHaveBeenCalledTimes(1)
        })

        it('fetches PTR records', async () => {
            reverse.mockResolvedValueOnce(['example.com'])
            await expect(fetchRecords('192.0.2.1', 'PTR')).resolves.toEqual(['example.com'])
            expect(reverse).toHaveBeenCalledWith('192.0.2.1')
        })
    })

    describe('fetchMxRecords', () => {
        it('fetches and sorts MX records by priority', async () => {
            resolveMx.mockResolvedValueOnce([
                { exchange: 'b.example.com', priority: 20 },
                { exchange: 'a.example.com', priority: 10 },
            ])
            await expect(fetchMxRecords('example.com')).resolves.toEqual([
                { exchange: 'a.example.com', priority: 10 },
                { exchange: 'b.example.com', priority: 20 },
            ])
            expect(resolveMx).toHaveBeenCalledWith('example.com')
        })
    })
})
