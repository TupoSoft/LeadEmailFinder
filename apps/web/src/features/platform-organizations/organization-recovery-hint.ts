const prefix = 'lef-platform-organization-reconciliation:'

/** A principal-scoped boolean only; never persist organization details or invitation data. */
export function readOrganizationRecoveryHint(membershipId: string): boolean {
    try {
        return sessionStorage.getItem(`${prefix}${membershipId}`) === '1'
    } catch {
        return false
    }
}

export function rememberOrganizationRecoveryHint(membershipId: string, required: boolean): void {
    try {
        if (required) sessionStorage.setItem(`${prefix}${membershipId}`, '1')
        else sessionStorage.removeItem(`${prefix}${membershipId}`)
    } catch {
        // Blocked storage still permits in-document reconciliation through the memory marker.
    }
}
