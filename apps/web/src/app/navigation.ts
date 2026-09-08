import type { CurrentAccount } from '../api/current-account'
import { authCopy } from '../content/auth-shell'
import { billingCopy } from '../content/billing'

export interface ApplicationDestination {
    path: string
    label: string
    capability?: CurrentAccount['capabilities'][number]
}

// Register a destination when its working route ships. Visibility is advisory;
// feature routes still call their API and handle its authoritative response.
export const applicationDestinations: readonly ApplicationDestination[] = [
    { path: '/app', label: authCopy.home },
    { path: '/app/verifications/new', label: 'Verify an email', capability: 'verification.run' },
    { path: '/app/billing', label: billingCopy.title, capability: 'billing.read' },
    { path: '/app/team', label: 'Team', capability: 'team.manage' },
]

export function visibleDestinations(
    capabilities: CurrentAccount['capabilities'],
    destinations: readonly ApplicationDestination[] = applicationDestinations,
) {
    return destinations.filter(item => !item.capability || capabilities.includes(item.capability))
}
