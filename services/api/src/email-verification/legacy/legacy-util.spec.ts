import { toLegacyResult } from './legacy-util'
import { describe, expect, it } from '@jest/globals'
import type { EmailVerificationResponse, EmailVerificationSource } from '../dto'
import { CatchAllStatus, DeliveryStatus } from './enums'
import type { LegacyEmailVerificationResult } from './dto'

describe('toLegacyResult', () => {
    it('should map correctly', () => {
        const input: EmailVerificationResponse = {
            email: 'test@example.com',
            localPart: 'test',
            domain: 'example.com',
            sources: ['linkedin'],
            exists: true,
            targetExchange: 'exchange.example.com',
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.email).toBe('test@example.com')
        expect(result.localPart).toBe('test')
        expect(result.domain).toBe('example.com')
        expect(result.targetExchange).toBe('exchange.example.com')
        expect(result.deliveryStatus).toBe(DeliveryStatus.Accepted)
        expect(result.catchAll).toBe(CatchAllStatus.Enabled)
    })

    it('should map verifiedAt to input value if provided', () => {
        const verifiedAt = new Date('2023-01-01')
        const input: EmailVerificationResponse = {
            email: 'test@example.com',
            localPart: 'test',
            domain: 'example.com',
            sources: [],
            exists: true,
            targetExchange: 'exchange.example.com',
            verifiedAt,
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.verifiedAt).toBe(verifiedAt)
    })

    it('should default verifiedAt to current date if not provided', () => {
        const input: EmailVerificationResponse = {
            email: 'test@example.com',
            localPart: 'test',
            domain: 'example.com',
            sources: [],
            exists: true,
            targetExchange: 'exchange.example.com',
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.verifiedAt).toBeInstanceOf(Date)

        const precision = -1
        expect(result.verifiedAt.getTime()).toBeCloseTo(new Date().getTime(), precision)
    })

    it('should map catchAll using mapCatchAllStatus function', () => {
        const sources: EmailVerificationSource[] = ['mx']

        const input: EmailVerificationResponse = {
            email: 'test@example.com',
            localPart: 'test',
            domain: 'example.com',
            sources,
            exists: true,
            targetExchange: 'exchange.example.com',
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.catchAll).toBe(CatchAllStatus.Disabled)
    })
})
