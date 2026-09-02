import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'

export const ACCOUNT_DISCOVERY_PURPOSE = 'email_verification.account_discovery' as const
export const ACCOUNT_DISCOVERY_UNAVAILABLE_REASON = 'account-discovery-provider-unavailable' as const

export type AccountDiscoveryProviderName =
    | 'microsoft_get_credential_type'
    | 'microsoft_login'
    | 'mimecast'
    | 'office_apps'

export interface Clock {
    now(): Date
}

export interface AccountDiscoveryApprovalView {
    id: string
    status: 'active' | 'suspended' | 'revoked' | 'expired'
    provider: AccountDiscoveryProviderName
    purpose: typeof ACCOUNT_DISCOVERY_PURPOSE
    region: string
    effectiveAt: string
    expiresAt: string
}

export interface AccountDiscoverySelection {
    approvalId: string
    provider: AccountDiscoveryProviderName
    region: string
}

export class AccountDiscoveryProviderUnavailableError extends Error {
    readonly code = ACCOUNT_DISCOVERY_UNAVAILABLE_REASON

    constructor() {
        super(ACCOUNT_DISCOVERY_UNAVAILABLE_REASON)
        this.name = AccountDiscoveryProviderUnavailableError.name
    }
}

export function isAccountDiscoveryApprovalAvailable(
    approval: AccountDiscoveryApprovalView,
    selection: AccountDiscoverySelection,
    now: Date,
): boolean {
    const nowMs = now.getTime()

    return (
        approval.id === selection.approvalId &&
        approval.status === 'active' &&
        approval.provider === selection.provider &&
        approval.purpose === ACCOUNT_DISCOVERY_PURPOSE &&
        approval.region === selection.region &&
        Date.parse(approval.effectiveAt) <= nowMs &&
        nowMs < Date.parse(approval.expiresAt)
    )
}

export class ApprovedAccountDiscoveryVerifier implements ICatchAllVerifier {
    readonly sourceName: ICatchAllVerifier['sourceName']

    constructor(
        private readonly verifier: ICatchAllVerifier,
        private readonly approval: AccountDiscoveryApprovalView,
        private readonly selection: AccountDiscoverySelection,
        private readonly clock: Clock,
    ) {
        this.sourceName = verifier.sourceName
    }

    async verify(email: string): Promise<boolean> {
        if (!isAccountDiscoveryApprovalAvailable(this.approval, this.selection, this.clock.now())) {
            throw new AccountDiscoveryProviderUnavailableError()
        }

        return await this.verifier.verify(email)
    }
}
