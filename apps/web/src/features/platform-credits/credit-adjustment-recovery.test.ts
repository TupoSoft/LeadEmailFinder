import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clearCreditAdjustment,
    creditAdjustmentRecoveryWindowMs,
    creditAdjustmentStoragePrefix,
    isCreditAdjustmentExpired,
    readCreditAdjustment,
    reconcileCreditAdjustments,
    saveCreditAdjustment,
    type CreditAdjustmentRecord,
} from './credit-adjustment-recovery'

const membershipId = '11111111-1111-4111-8111-111111111111'
const organizationId = '22222222-2222-4222-8222-222222222222'
const otherId = '33333333-3333-4333-8333-333333333333'
const storageKey = `${creditAdjustmentStoragePrefix}${membershipId}`
const record = (): CreditAdjustmentRecord => ({
    version: 1,
    membershipId,
    organizationId,
    amount: 25,
    key: '44444444-4444-4444-8444-444444444444',
    state: 'pending',
    createdAt: Date.now(),
})

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('credit adjustment recovery', () => {
    it('persists before dispatch and restores the same operation across reload without changing its key', () => {
        const adjustment = record()
        expect(saveCreditAdjustment(adjustment)).toBe(true)
        expect(readCreditAdjustment(membershipId, organizationId)).toEqual(adjustment)
        expect(saveCreditAdjustment({ ...adjustment, state: 'unknown' })).toBe(true)
        expect(readCreditAdjustment(membershipId, organizationId)).toEqual({ ...adjustment, state: 'unknown' })
        expect(clearCreditAdjustment(membershipId)).toBe(true)
        expect(readCreditAdjustment(membershipId, organizationId)).toBeNull()
    })

    it.each([
        { key: otherId },
        { organizationId: otherId },
        { amount: 26 },
        { membershipId: otherId },
        { createdAt: 1 },
    ])('refuses to replace an unresolved operation (%j)', change => {
        const adjustment = record()
        expect(saveCreditAdjustment(adjustment)).toBe(true)
        expect(saveCreditAdjustment({ ...adjustment, ...change })).toBe(false)
        expect(readCreditAdjustment(membershipId, organizationId)).toEqual(adjustment)
    })

    it.each([
        '{',
        'null',
        '[]',
        '{}',
        JSON.stringify({ ...record(), version: 2 }),
        JSON.stringify({ ...record(), membershipId: 'not-a-uuid' }),
        JSON.stringify({ ...record(), organizationId: 'not-a-uuid' }),
        JSON.stringify({ ...record(), key: 'not-a-uuid' }),
        JSON.stringify({ ...record(), key: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' }),
        JSON.stringify({ ...record(), state: 'success' }),
        JSON.stringify({ ...record(), amount: 0 }),
        JSON.stringify({ ...record(), amount: 1.5 }),
        JSON.stringify({ ...record(), amount: 2147483648 }),
        JSON.stringify({ ...record(), createdAt: '2026-09-09' }),
        JSON.stringify({ ...record(), createdAt: Number.MAX_SAFE_INTEGER }),
        JSON.stringify({ ...record(), extra: 'untrusted' }),
    ])('removes malformed recovery data without returning it (case %#)', raw => {
        sessionStorage.setItem(storageKey, raw)
        expect(readCreditAdjustment(membershipId, organizationId)).toBeNull()
        expect(sessionStorage.getItem(storageKey)).toBeNull()
    })

    it('removes wrong-principal and wrong-organization data without exposing it', () => {
        saveCreditAdjustment(record())
        expect(readCreditAdjustment(otherId, organizationId)).toBeNull()
        expect(sessionStorage.getItem(storageKey)).toBeNull()
        saveCreditAdjustment(record())
        expect(readCreditAdjustment(membershipId, otherId)).toBeNull()
        expect(sessionStorage.getItem(storageKey)).toBeNull()
        sessionStorage.setItem(storageKey, JSON.stringify({ ...record(), membershipId: otherId }))
        expect(readCreditAdjustment(membershipId, organizationId)).toBeNull()
    })

    it('keeps expired recovery until explicit acknowledgement instead of silently losing the only key', () => {
        const expired = { ...record(), createdAt: Date.now() - creditAdjustmentRecoveryWindowMs }
        expect(saveCreditAdjustment(expired)).toBe(true)
        const restored = readCreditAdjustment(membershipId, organizationId)
        expect(restored).toEqual(expired)
        expect(isCreditAdjustmentExpired(expired)).toBe(true)
        expect(isCreditAdjustmentExpired(expired, expired.createdAt + creditAdjustmentRecoveryWindowMs - 1)).toBe(false)
        reconcileCreditAdjustments(membershipId)
        expect(readCreditAdjustment(membershipId, organizationId)).toEqual(expired)
        clearCreditAdjustment(membershipId)
        expect(readCreditAdjustment(membershipId, organizationId)).toBeNull()
    })

    it('cleans every recovery namespace at logout without touching unrelated session storage', () => {
        sessionStorage.setItem(storageKey, JSON.stringify(record()))
        sessionStorage.setItem(`${creditAdjustmentStoragePrefix}${otherId}`, JSON.stringify(record()))
        sessionStorage.setItem('unrelated', 'retained')
        reconcileCreditAdjustments()
        expect(sessionStorage.length).toBe(1)
        expect(sessionStorage.getItem('unrelated')).toBe('retained')
    })

    it('fails closed if storage cannot durably retain the recovery key', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('Storage denied')
        })
        expect(saveCreditAdjustment(record())).toBe(false)
        expect(readCreditAdjustment(membershipId, organizationId)).toBeNull()
    })

    it('does not report cleanup success when the browser blocks removal', () => {
        saveCreditAdjustment(record())
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('Storage denied')
        })
        expect(clearCreditAdjustment(membershipId)).toBe(false)
        expect(() => reconcileCreditAdjustments()).not.toThrow()
    })
})
