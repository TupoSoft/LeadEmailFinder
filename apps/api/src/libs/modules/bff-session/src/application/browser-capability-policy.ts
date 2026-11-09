import { AuthRole } from '@tuposoft/lead-email-finder/modules/identity'

export const BROWSER_CAPABILITIES = [
    'verification.run',
    'verification.read',
    'team.manage',
    'service_clients.manage',
    'billing.read',
    'billing.manage',
    'platform.organizations.manage',
    'platform.credits.manage',
    'platform.proxies.manage',
] as const

export type BrowserCapability = (typeof BROWSER_CAPABILITIES)[number]

const CAPABILITIES_BY_ROLE = {
    member: Object.freeze(['verification.run', 'verification.read']),
    admin: Object.freeze(['verification.run', 'verification.read', 'team.manage', 'service_clients.manage']),
    owner: Object.freeze([
        'verification.run',
        'verification.read',
        'team.manage',
        'service_clients.manage',
        'billing.read',
        'billing.manage',
    ]),
    platform_admin: Object.freeze([
        'platform.organizations.manage',
        'platform.credits.manage',
        'platform.proxies.manage',
    ]),
} satisfies Record<AuthRole, readonly BrowserCapability[]>

export class BrowserCapabilityPolicy {
    capabilitiesFor(role: AuthRole): readonly BrowserCapability[] {
        return CAPABILITIES_BY_ROLE[role]
    }
}
