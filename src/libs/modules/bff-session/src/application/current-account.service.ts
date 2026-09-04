import {
    AuthPrincipal,
    AuthRole,
    CurrentAccountReader,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    ServiceClientGrantablePermission,
    ServiceClientGrantPolicy,
} from '@tuposoft/lead-email-finder/modules/auth'
import { BrowserCapability, BrowserCapabilityPolicy } from './browser-capability-policy'

export interface CurrentAccountContext {
    readonly email: string | null
    readonly membership: {
        readonly id: string
        readonly role: AuthRole
    }
    readonly organization: {
        readonly id: string
        readonly name: string
    }
    readonly capabilities: readonly BrowserCapability[]
    readonly grantableServiceClientPermissions: readonly ServiceClientGrantablePermission[]
}

export class HumanSessionRequiredError extends Error {
    constructor() {
        super('A human session is required')
        this.name = 'HumanSessionRequiredError'
    }
}

export class CurrentAccountUnavailableError extends Error {
    constructor() {
        super('Current account is unavailable')
        this.name = 'CurrentAccountUnavailableError'
    }
}

export class CurrentAccountService {
    constructor(
        private readonly currentAccountReader: CurrentAccountReader,
        private readonly browserCapabilityPolicy: BrowserCapabilityPolicy,
        private readonly serviceClientGrantPolicy: ServiceClientGrantPolicy,
    ) {}

    async get(principal: AuthPrincipal): Promise<CurrentAccountContext> {
        if (principal.credentialKind !== 'human_session') {
            throw new HumanSessionRequiredError()
        }

        const account = await this.currentAccountReader.read({
            externalIdentityId: principal.credentialId,
            organizationId: principal.organizationId,
        })
        if (!account) {
            throw new CurrentAccountUnavailableError()
        }

        return {
            email: account.email,
            membership: {
                id: account.membership.id,
                role: account.membership.role,
            },
            organization: {
                id: account.organization.id,
                name: account.organization.name,
            },
            capabilities: this.browserCapabilityPolicy.capabilitiesFor(account.membership.role),
            grantableServiceClientPermissions: this.serviceClientGrantPolicy.grantablePermissionsFor(
                account.membership.role,
            ),
        }
    }
}
