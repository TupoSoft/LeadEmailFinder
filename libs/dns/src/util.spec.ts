import { describe, expect, it, jest } from '@jest/globals'
import { fetchMxRecords, fetchRecords } from './util'
import { resolveMx, reverse } from 'node:dns/promises'
import { DNSTypeMap } from '../../../apps/lead-email-finder-api/src/common'

jest.mock('node:dns/promises', () => ({
    resolveMx: jest.fn(),
    reverse: jest.fn(),
}))

describe('DNS Utilities', () => {
    const resolveMxMock = resolveMx as jest.Mock<typeof resolveMx>

    const reverseMock = reverse as jest.Mock<typeof reverse>

    describe('fetchRecords', () => {
        it('should fetch MX records', async () => {
            const mxRecords: DNSTypeMap['MX'] = [{ exchange: 'mail.example.com', priority: 10 }]
            resolveMxMock.mockResolvedValueOnce(mxRecords)

            const result = await fetchRecords('example.com', 'MX')

            expect(resolveMx).toHaveBeenCalledWith('example.com')
            expect(result).toEqual(mxRecords)
        })

        it('should fetch PTR records', async () => {
            const ptrRecords: DNSTypeMap['PTR'] = ['example.com']
            reverseMock.mockResolvedValueOnce(ptrRecords)

            const result = await fetchRecords('192.0.2.1', 'PTR')

            expect(reverse).toHaveBeenCalledWith('192.0.2.1')
            expect(result).toEqual(ptrRecords)
        })
    })

    describe('fetchMxRecords', () => {
        it('should fetch and sort MX records by priority', async () => {
            const unsortedRecords = [
                { exchange: 'b.example.com', priority: 20 },
                { exchange: 'a.example.com', priority: 10 },
            ]

            const sortedRecords = [
                { exchange: 'a.example.com', priority: 10 },
                { exchange: 'b.example.com', priority: 20 },
            ]

            resolveMxMock.mockResolvedValueOnce(unsortedRecords)

            const result = await fetchMxRecords('example.com')

            expect(resolveMx).toHaveBeenCalledWith('example.com')
            expect(result).toEqual(sortedRecords)
        })
    })
})
