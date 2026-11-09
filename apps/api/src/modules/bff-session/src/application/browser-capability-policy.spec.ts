import { AUTH_ROLES, AuthRole } from '@tuposoft/lead-email-finder/modules/identity'
import { BrowserCapability, BrowserCapabilityPolicy } from './browser-capability-policy'

describe('BrowserCapabilityPolicy', () => {
    const policy = new BrowserCapabilityPolicy()

    const expectedByRole: Record<AuthRole, readonly BrowserCapability[]> = {
        member: ['verification.run', 'verification.read'],
        admin: ['verification.run', 'verification.read', 'team.manage', 'service_clients.manage'],
        owner: [
            'verification.run',
            'verification.read',
            'team.manage',
            'service_clients.manage',
            'billing.read',
            'billing.manage',
        ],
        platform_admin: ['platform.organizations.manage', 'platform.credits.manage', 'platform.proxies.manage'],
    }

    it.each(AUTH_ROLES)('returns the exact ordered capabilities for %s', role => {
        expect(policy.capabilitiesFor(role)).toEqual(expectedByRole[role])
    })
})
