import { authCopy } from '../content/auth-shell'
import { billingCopy } from '../content/billing'

export interface ApplicationDestination {
    path: string
    label: string
}

export const applicationDestinations: readonly ApplicationDestination[] = [
    { path: '/app', label: authCopy.home },
    { path: '/app/verifications/new', label: 'Verify an email' },
    { path: '/app/billing', label: billingCopy.title },
]
