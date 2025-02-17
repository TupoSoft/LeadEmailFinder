import { toLegacyResult } from './legacy-util'
import { describe, expect, it } from '@jest/globals'
import { type EmailVerificationResponse, ExistenceStatus } from '../dto'
import { CatchAllStatus, DeliveryStatus } from './enums'
import type { LegacyEmailVerificationResult } from './dto'
import type { SMTPVerificationResult } from '../../smtp/dto'

describe('toLegacyResult', () => {
    it('should map correctly', () => {
        const targetExchange = 'exchange.example.com'

        const smtpVerificationResult: SMTPVerificationResult = {
            success: true,
            catchAll: true,
            mxRecord: targetExchange,
        }

        const input: EmailVerificationResponse = {
            email: 'test@example.com',
            username: 'test',
            domain: 'example.com',
            sources: {
                mx: smtpVerificationResult,
            },
            status: ExistenceStatus.Exists,
            checkedAt: '',
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
        const smtpVerificationResult: SMTPVerificationResult = {
            success: true,
            catchAll: true,
        }

        const verifiedAt = new Date('2023-01-01')
        const input: EmailVerificationResponse = {
            email: 'test@example.com',
            username: 'test',
            domain: 'example.com',
            sources: {
                mx: smtpVerificationResult,
            },
            status: ExistenceStatus.Unknown,
            checkedAt: verifiedAt.toISOString(),
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.verifiedAt).toStrictEqual(verifiedAt)
    })

    it('should default verifiedAt to current date if not provided', () => {
        const smtpVerificationResult: SMTPVerificationResult = {
            success: true,
            catchAll: true,
        }

        const input: EmailVerificationResponse = {
            checkedAt: '',
            email: 'test@example.com',
            username: 'test',
            domain: 'example.com',
            sources: {
                mx: smtpVerificationResult,
            },
            status: ExistenceStatus.Unknown,
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.verifiedAt).toBeInstanceOf(Date)

        const precision = -1
        expect(result.verifiedAt.getTime()).toBeCloseTo(new Date().getTime(), precision)
    })

    it('should map catchAll using mapCatchAllStatus function', () => {
        const smtpVerificationResult: SMTPVerificationResult = {
            success: true,
            catchAll: false,
        }

        const input: EmailVerificationResponse = {
            email: 'test@example.com',
            username: 'test',
            domain: 'example.com',
            sources: {
                mx: smtpVerificationResult,
            },
            status: ExistenceStatus.Exists,
            checkedAt: '',
        }

        const result: LegacyEmailVerificationResult = toLegacyResult(input)

        expect(result.catchAll).toBe(CatchAllStatus.Disabled)
    })
})
