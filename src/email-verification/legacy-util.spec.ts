import { toLegacyResult } from './legacy-util'
import { describe, expect, it } from '@jest/globals'
import type { EmailVerificationResult, EmailVerificationSource, LegacyEmailVerificationResult } from './dto'

describe('toLegacyResult', () => {
    it('should map email, localPart, and domain correctly', () => {
        const input: EmailVerificationResult = {
            email: 'test@example.com',
            localPart: 'test',
            domain: 'example.com',
            sources: [],
            exists: true,
            targetExchange: 'exchange.example.com',
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.email).toBe('test@example.com')
        expect(result.localPart).toBe('test')
        expect(result.domain).toBe('example.com')
    })

    it('should map targetExchange correctly', () => {
        const input: EmailVerificationResult = {
            email: 'test@example.com',
            localPart: 'test',
            domain: 'example.com',
            sources: [],
            exists: true,
            targetExchange: 'exchange.example.com',
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.targetExchange).toBe('exchange.example.com')
    })

    it('should map verifiedAt to input value if provided', () => {
        const verifiedAt = new Date('2023-01-01')
        const input: EmailVerificationResult = {
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
        const input: EmailVerificationResult = {
            email: 'test@example.com',
            localPart: 'test',
            domain: 'example.com',
            sources: [],
            exists: true,
            targetExchange: 'exchange.example.com',
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.verifiedAt).toBeInstanceOf(Date)
        expect(result.verifiedAt.getTime()).toBeCloseTo(new Date().getTime())
    })

    it('should map catchAll using mapCatchAllStatus function', () => {
        const sources: EmailVerificationSource[] = ['SMTP']
        const input: EmailVerificationResult = {
            email: 'test@example.com',
            localPart: 'test',
            domain: 'example.com',
            sources,
            exists: true,
            targetExchange: 'exchange.example.com',
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.catchAll).toBeDefined()
    })

    it('should map deliveryStatus using mapDeliveryStatus function', () => {
        const input: EmailVerificationResult = {
            email: 'test@example.com',
            localPart: 'test',
            domain: 'example.com',
            sources: [],
            exists: true,
            targetExchange: 'exchange.example.com',
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.deliveryStatus).toBeDefined()
    })
})
