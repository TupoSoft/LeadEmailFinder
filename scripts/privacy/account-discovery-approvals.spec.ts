import { readFile } from 'node:fs/promises'
import { stringify } from 'yaml'
import {
    ACCOUNT_DISCOVERY_APPROVALS_PATH,
    ACCOUNT_DISCOVERY_APPROVALS_RELATIVE_PATH,
    AccountDiscoveryApproval,
    AccountDiscoveryApprovalManifest,
    checkAccountDiscoveryApprovals,
    loadAccountDiscoveryApprovals,
    parseAccountDiscoveryApprovals,
} from './account-discovery-approvals'

const NOW = new Date('2026-09-02T10:00:00Z')

function approval(overrides: Partial<AccountDiscoveryApproval> = {}): AccountDiscoveryApproval {
    return {
        id: 'approval-test-001',
        status: 'active',
        provider: 'microsoft_login',
        purpose: 'email_verification.account_discovery',
        region: 'global',
        effectiveAt: '2026-09-01T00:00:00Z',
        expiresAt: '2026-10-01T00:00:00Z',
        processingContractVersion: 'processing-contract-v1',
        recipientRegisterId: 'recipient-test-001',
        vendorReviewEvidenceId: 'vendor-review-test-001',
        securityReviewEvidenceId: 'security-review-test-001',
        transferReviewEvidenceId: 'transfer-review-test-001',
        customerAuthorizationEvidenceId: 'customer-authorization-test-001',
        approvalOwner: 'privacy-owner-test',
        reviewedAt: '2026-08-31T00:00:00Z',
        ...overrides,
    }
}

function manifest(
    approvals: AccountDiscoveryApproval[] = [approval()],
    revision = 'test-revision-001',
): AccountDiscoveryApprovalManifest {
    return { schemaVersion: 1, revision, approvals }
}

function yaml(value: unknown): string {
    return stringify(value, { lineWidth: 0 })
}

describe(parseAccountDiscoveryApprovals.name, () => {
    it('accepts the exact initial empty manifest', () => {
        expect(parseAccountDiscoveryApprovals('schemaVersion: 1\nrevision: initial-empty\napprovals: []\n')).toEqual({
            schemaVersion: 1,
            revision: 'initial-empty',
            approvals: [],
        })
    })

    it('rejects duplicate approval IDs', () => {
        expect(() => parseAccountDiscoveryApprovals(yaml(manifest([approval(), approval()])))).toThrow(
            'Duplicate approval ID',
        )
    })

    it.each([
        ['a root key', { ...manifest(), unexpected: true }],
        ['an approval key', manifest([{ ...approval(), unexpected: true } as AccountDiscoveryApproval])],
    ])('rejects unknown keys in %s', (_description, value) => {
        expect(() => parseAccountDiscoveryApprovals(yaml(value))).toThrow('Unrecognized key')
    })

    it('rejects unknown providers', () => {
        const value = manifest([{ ...approval(), provider: 'linkedin' } as unknown as AccountDiscoveryApproval])

        expect(() => parseAccountDiscoveryApprovals(yaml(value))).toThrow('approvals.0.provider')
    })

    it.each(['2026-09-01T02:00:00+02:00', '2026-09-01T00:00:00'])('rejects non-UTC instants: %s', effectiveAt => {
        expect(() => parseAccountDiscoveryApprovals(yaml(manifest([approval({ effectiveAt })])))).toThrow(
            'approvals.0.effectiveAt',
        )
    })

    it.each(['2026-09-01T00:00:00Z', '2026-08-31T23:59:59Z'])(
        'rejects a validity interval ending at or before its start: %s',
        expiresAt => {
            expect(() => parseAccountDiscoveryApprovals(yaml(manifest([approval({ expiresAt })])))).toThrow(
                'Must be later than effectiveAt',
            )
        },
    )

    it.each([
        'processingContractVersion',
        'recipientRegisterId',
        'vendorReviewEvidenceId',
        'securityReviewEvidenceId',
        'transferReviewEvidenceId',
        'customerAuthorizationEvidenceId',
        'approvalOwner',
    ] as const)('rejects an active approval with missing %s evidence', field => {
        expect(() => parseAccountDiscoveryApprovals(yaml(manifest([approval({ [field]: '' })])))).toThrow(
            `approvals.0.${field}`,
        )
    })

    it('rejects secret-looking values without echoing them', () => {
        const secret = ['Bearer', 'synthetic', 'credential', 'material'].join('-')

        expect(() =>
            parseAccountDiscoveryApprovals(
                yaml(manifest([approval({ vendorReviewEvidenceId: secret.replace('-', ' ') })])),
            ),
        ).toThrow('Secret-looking values are not allowed')

        try {
            parseAccountDiscoveryApprovals(
                yaml(manifest([approval({ vendorReviewEvidenceId: secret.replace('-', ' ') })])),
            )
        } catch (error) {
            expect((error as Error).message).not.toContain(secret.replace('-', ' '))
        }
    })

    it('rejects secret-looking values in YAML comments without echoing them', () => {
        const secret = ['synthetic', 'comment', 'credential'].join('-')
        const source = `schemaVersion: 1\nrevision: initial-empty\napprovals: []\n# token: ${secret}\n`

        expect(() => parseAccountDiscoveryApprovals(source)).toThrow('including in comments')

        try {
            parseAccountDiscoveryApprovals(source)
        } catch (error) {
            expect((error as Error).message).not.toContain(secret)
        }
    })

    it('rejects approvals under the reserved initial-empty revision', () => {
        expect(() => parseAccountDiscoveryApprovals(yaml(manifest([approval()], 'initial-empty')))).toThrow(
            'initial-empty revision cannot contain approvals',
        )
    })
})

describe(checkAccountDiscoveryApprovals.name, () => {
    it('accepts active approvals whose expiry is in the future', () => {
        expect(checkAccountDiscoveryApprovals(yaml(manifest()), { now: NOW }).approvals).toHaveLength(1)
    })

    it('rejects active approvals at and after the expiry boundary', () => {
        const source = yaml(manifest([approval({ expiresAt: NOW.toISOString() })]))

        expect(() => checkAccountDiscoveryApprovals(source, { now: NOW })).toThrow('Active approval is expired')
    })

    it('does not apply the CI expiry rule to inactive approvals', () => {
        const source = yaml(
            manifest([
                approval({
                    status: 'revoked',
                    effectiveAt: '2026-08-01T00:00:00Z',
                    expiresAt: '2026-09-01T00:00:00Z',
                }),
            ]),
        )

        expect(checkAccountDiscoveryApprovals(source, { now: NOW }).approvals[0].status).toBe('revoked')
    })

    it('requires a revision change when approval content changes', () => {
        const previousSource = yaml(manifest([approval()], 'test-revision-001'))
        const source = yaml(manifest([approval({ region: 'eu' })], 'test-revision-001'))

        expect(() => checkAccountDiscoveryApprovals(source, { now: NOW, previousSource })).toThrow(
            'Must change whenever approval content changes',
        )
    })

    it('accepts changed approval content under a new revision', () => {
        const previousSource = yaml(manifest([approval()], 'test-revision-001'))
        const source = yaml(manifest([approval({ region: 'eu' })], 'test-revision-002'))

        expect(checkAccountDiscoveryApprovals(source, { now: NOW, previousSource }).revision).toBe('test-revision-002')
    })

    it('accepts unchanged approval content without a revision change', () => {
        const source = yaml(manifest())

        expect(checkAccountDiscoveryApprovals(source, { now: NOW, previousSource: source }).revision).toBe(
            'test-revision-001',
        )
    })

    it('fails closed without a Git baseline for a populated manifest', () => {
        expect(() =>
            checkAccountDiscoveryApprovals(yaml(manifest()), {
                now: NOW,
                previousSource: null,
                requireRevisionBaseline: true,
            }),
        ).toThrow('Cannot validate a nonempty manifest without the previous Git revision')
    })
})

describe(loadAccountDiscoveryApprovals.name, () => {
    it('loads the fixed repository-owned manifest path', async () => {
        expect(ACCOUNT_DISCOVERY_APPROVALS_PATH).toBe(`${process.cwd()}/${ACCOUNT_DISCOVERY_APPROVALS_RELATIVE_PATH}`)
        await expect(loadAccountDiscoveryApprovals()).resolves.toEqual({
            schemaVersion: 1,
            revision: 'initial-empty',
            approvals: [],
        })
        await expect(readFile(ACCOUNT_DISCOVERY_APPROVALS_PATH, 'utf8')).resolves.toBe(
            'schemaVersion: 1\nrevision: initial-empty\napprovals: []\n',
        )
    })
})
