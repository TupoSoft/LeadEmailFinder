import {
    ACCOUNT_DISCOVERY_PURPOSE,
    ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
    AccountDiscoveryApprovalView,
    AccountDiscoverySelection,
    ApprovedAccountDiscoveryVerifier,
    Clock,
    isAccountDiscoveryApprovalAvailable,
} from './approved-account-discovery-verifier'
import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'

const selection: AccountDiscoverySelection = {
    approvalId: 'approval-fixture-1',
    provider: 'office_apps',
    region: 'us',
}

const approval = (overrides: Partial<AccountDiscoveryApprovalView> = {}): AccountDiscoveryApprovalView => ({
    id: selection.approvalId,
    status: 'active',
    provider: selection.provider,
    purpose: ACCOUNT_DISCOVERY_PURPOSE,
    region: selection.region,
    effectiveAt: '2026-09-02T10:00:00.000Z',
    expiresAt: '2026-09-02T11:00:00.000Z',
    ...overrides,
})

describe('isAccountDiscoveryApprovalAvailable', () => {
    it.each([
        ['before the effective instant', '2026-09-02T09:59:59.999Z', false],
        ['at the effective instant', '2026-09-02T10:00:00.000Z', true],
        ['before the expiry instant', '2026-09-02T10:59:59.999Z', true],
        ['at the expiry instant', '2026-09-02T11:00:00.000Z', false],
        ['after the expiry instant', '2026-09-02T11:00:00.001Z', false],
    ])('is %s', (_name, now, expected) => {
        expect(isAccountDiscoveryApprovalAvailable(approval(), selection, new Date(now))).toBe(expected)
    })

    it.each([
        ['id', { id: 'another-approval' }],
        ['status', { status: 'revoked' as const }],
        ['provider', { provider: 'mimecast' as const }],
        ['purpose', { purpose: 'another-purpose' as never }],
        ['region', { region: 'uk' }],
    ])('rejects a mismatched %s', (_name, overrides) => {
        expect(
            isAccountDiscoveryApprovalAvailable(approval(overrides), selection, new Date('2026-09-02T10:30:00Z')),
        ).toBe(false)
    })
})

describe('ApprovedAccountDiscoveryVerifier', () => {
    it('delegates while the approval is available', async () => {
        const verifier = {
            sourceName: 'microsoft_2',
            verify: jest.fn().mockResolvedValue(true),
        } satisfies ICatchAllVerifier
        const clock: Clock = { now: () => new Date('2026-09-02T10:30:00Z') }
        const approvedVerifier = new ApprovedAccountDiscoveryVerifier(verifier, approval(), selection, clock)

        await expect(approvedVerifier.verify('person@example.test')).resolves.toBe(true)
        expect(verifier.verify).toHaveBeenCalledWith('person@example.test')
    })

    it('fails closed without disclosing the address after approval expiry', async () => {
        const verifier = {
            sourceName: 'microsoft_2',
            verify: jest.fn().mockResolvedValue(true),
        } satisfies ICatchAllVerifier
        let now = new Date('2026-09-02T10:30:00Z')
        const clock: Clock = { now: () => now }
        const approvedVerifier = new ApprovedAccountDiscoveryVerifier(verifier, approval(), selection, clock)

        await expect(approvedVerifier.verify('first@example.test')).resolves.toBe(true)
        now = new Date('2026-09-02T11:00:00Z')
        await expect(approvedVerifier.verify('second@example.test')).rejects.toMatchObject({
            message: ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
            code: ACCOUNT_DISCOVERY_UNAVAILABLE_REASON,
        })
        expect(verifier.verify).toHaveBeenCalledTimes(1)
    })
})
