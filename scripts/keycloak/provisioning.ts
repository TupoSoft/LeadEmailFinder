import {
    AuthenticationExecutionRepresentation,
    AuthenticationFlowRepresentation,
    ClientRepresentation,
    IdentifiedRepresentation,
    JsonObject,
    KeycloakAdminPort,
    NamedRepresentation,
} from './keycloak-admin-api'

export const REALM = 'lead-email-finder'
export const API_AUDIENCE = 'lead-email-finder-api'
export const BFF_CLIENT_ID = 'lef-web-bff'
// Fixed, checked-in dev-only secret: the containerized
// api service needs BFF_CLIENT_SECRET to boot (it is a required, non-optional config value), but Keycloak's
// own auto-generated per-realm client secret is not known until provisioning runs against a live Keycloak
// instance. Setting an explicit secret on the client sidesteps that chicken-and-egg problem entirely.
export const BFF_CLIENT_DEV_SECRET = 'lef-web-bff-development-only-client-secret'
export const SERVICE_CLIENT_ID = 'lef-development-service'
export const ORG_ADMIN_CLIENT_ID = 'lef-org-admin-service'
// Same fixed-dev-secret trick as BFF_CLIENT_DEV_SECRET: the running api service needs
// KEYCLOAK_ORG_ADMIN_CLIENT_SECRET to call Keycloak's Admin API, but Keycloak's own auto-generated
// secret isn't known until provisioning runs, so we set an explicit one instead.
export const ORG_ADMIN_CLIENT_DEV_SECRET = 'lef-org-admin-service-development-only-client-secret'
export const AUDIENCE_SCOPE = 'lef-api-audience'
export const BROWSER_FLOW = 'lef-browser'
export const DEVELOPMENT_ORGANIZATION = 'development'
const REALM_MANAGEMENT_CLIENT_ID = 'realm-management'
const ORG_ADMIN_SERVICE_ACCOUNT_ROLES = [
    'manage-users',
    'view-users',
    'query-users',
    'view-realm',
    'manage-clients',
    'view-clients',
]

export interface ProvisioningOptions {
    bffRedirectUris: string[]
    bffPostLogoutRedirectUris: string[]
}

export interface ServiceClientCredentials {
    issuer: string
    clientId: string
    clientSecret: string
    audience: string
}

export interface BffClientCredentials {
    issuer: string
    clientId: string
    clientSecret: string
    audience: string
    redirectUris: string[]
}

export interface OrgAdminClientCredentials {
    issuer: string
    clientId: string
    clientSecret: string
}

export interface ProvisioningResult {
    service: ServiceClientCredentials
    bff: BffClientCredentials
    orgAdmin: OrgAdminClientCredentials
}

interface NamedRepository<T extends IdentifiedRepresentation> {
    find(): Promise<T | undefined>
    create(): Promise<void>
    update(existing: T): Promise<void>
}

export function createRealmRepresentation(): JsonObject {
    return {
        realm: REALM,
        displayName: 'Lead Email Finder',
        enabled: true,
        registrationAllowed: false,
        resetPasswordAllowed: true,
        verifyEmail: true,
        bruteForceProtected: true,
        failureFactor: 5,
        waitIncrementSeconds: 60,
        maxFailureWaitSeconds: 900,
        organizationsEnabled: true,
    }
}

export function createBffClient(options: ProvisioningOptions): ClientRepresentation {
    return {
        clientId: BFF_CLIENT_ID,
        name: 'Lead Email Finder web BFF',
        enabled: true,
        protocol: 'openid-connect',
        publicClient: false,
        secret: BFF_CLIENT_DEV_SECRET,
        standardFlowEnabled: true,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: false,
        redirectUris: options.bffRedirectUris,
        webOrigins: options.bffRedirectUris.map(uri => new URL(uri).origin),
        attributes: {
            'pkce.code.challenge.method': 'S256',
            'post.logout.redirect.uris': options.bffPostLogoutRedirectUris.join('##'),
        },
    }
}

export function createServiceClient(): ClientRepresentation {
    return {
        clientId: SERVICE_CLIENT_ID,
        name: 'Lead Email Finder development service',
        enabled: true,
        protocol: 'openid-connect',
        publicClient: false,
        standardFlowEnabled: false,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: true,
    }
}

export function createOrgAdminClient(): ClientRepresentation {
    return {
        clientId: ORG_ADMIN_CLIENT_ID,
        name: 'Lead Email Finder organization administration service',
        enabled: true,
        protocol: 'openid-connect',
        publicClient: false,
        secret: ORG_ADMIN_CLIENT_DEV_SECRET,
        standardFlowEnabled: false,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: true,
    }
}

export async function reconcileResource<T extends IdentifiedRepresentation>(
    repository: NamedRepository<T>,
): Promise<T> {
    const existing = await repository.find()
    if (existing) {
        await repository.update(existing)
        return existing
    }
    await repository.create()
    const created = await repository.find()
    if (!created) {
        throw new Error('Keycloak resource was not visible after creation')
    }
    return created
}

export class KeycloakProvisioner {
    constructor(
        private readonly api: KeycloakAdminPort,
        private readonly baseUrl: string,
        private readonly options: ProvisioningOptions,
    ) {}

    async provision(): Promise<ProvisioningResult> {
        await this.ensureRealm()
        await this.ensureRoles()
        await this.ensureOrganization()
        await this.ensureClient(this.audienceClient())
        const audienceScope = await this.ensureClientScope(API_AUDIENCE)
        const bffClient = await this.ensureClient(createBffClient(this.options))
        const serviceClient = await this.ensureClient(createServiceClient())
        const orgAdminClient = await this.ensureClient(createOrgAdminClient())
        await this.assignDefaultScope(bffClient.id as string, audienceScope.id as string)
        await this.assignDefaultScope(serviceClient.id as string, audienceScope.id as string)
        await this.ensurePrivilegedBrowserFlow()
        await this.ensureOrgAdminServiceAccountRoles(orgAdminClient.id as string)

        const issuer = `${this.baseUrl}/realms/${REALM}`

        const serviceSecret = await this.api.request<{ value: string }>(
            'GET',
            `/admin/realms/${REALM}/clients/${serviceClient.id}/client-secret`,
        )
        if (!serviceSecret.value) {
            throw new Error('Keycloak did not return a service client secret')
        }

        const bffSecret = await this.api.request<{ value: string }>(
            'GET',
            `/admin/realms/${REALM}/clients/${bffClient.id}/client-secret`,
        )
        if (!bffSecret.value) {
            throw new Error('Keycloak did not return a BFF client secret')
        }

        const orgAdminSecret = await this.api.request<{ value: string }>(
            'GET',
            `/admin/realms/${REALM}/clients/${orgAdminClient.id}/client-secret`,
        )
        if (!orgAdminSecret.value) {
            throw new Error('Keycloak did not return an organization administration client secret')
        }

        return {
            service: {
                issuer,
                clientId: SERVICE_CLIENT_ID,
                clientSecret: serviceSecret.value,
                audience: API_AUDIENCE,
            },
            bff: {
                issuer,
                clientId: BFF_CLIENT_ID,
                clientSecret: bffSecret.value,
                audience: API_AUDIENCE,
                redirectUris: this.options.bffRedirectUris,
            },
            orgAdmin: {
                issuer,
                clientId: ORG_ADMIN_CLIENT_ID,
                clientSecret: orgAdminSecret.value,
            },
        }
    }

    private async ensureRealm(): Promise<void> {
        const desired = createRealmRepresentation()
        const existing = await this.api.requestOrUndefined<JsonObject>(`/admin/realms/${REALM}`)
        if (existing) {
            await this.api.request('PUT', `/admin/realms/${REALM}`, { ...existing, ...desired })
        } else {
            await this.api.request('POST', '/admin/realms', desired)
        }
    }

    private async ensureRoles(): Promise<void> {
        const roleNames = ['member', 'mfa_required', 'owner', 'admin', 'platform_admin']
        for (const name of roleNames) {
            const encodedName = encodeURIComponent(name)
            const existing = await this.api.requestOrUndefined<NamedRepresentation>(
                `/admin/realms/${REALM}/roles/${encodedName}`,
            )
            if (!existing) {
                await this.api.request('POST', `/admin/realms/${REALM}/roles`, { name })
            }
        }
        const mfaRole = await this.api.request<NamedRepresentation>('GET', `/admin/realms/${REALM}/roles/mfa_required`)
        for (const privilegedRole of ['owner', 'admin', 'platform_admin']) {
            await this.api.request(
                'POST',
                `/admin/realms/${REALM}/roles/${privilegedRole}/composites`,
                [mfaRole],
                [204],
            )
        }
    }

    private async ensureOrganization(): Promise<void> {
        const desired: NamedRepresentation = {
            name: DEVELOPMENT_ORGANIZATION,
            alias: DEVELOPMENT_ORGANIZATION,
            enabled: true,
            domains: [{ name: 'lef.test', verified: false }],
        }
        await reconcileResource({
            find: async () => {
                const organizations = await this.api.request<NamedRepresentation[]>(
                    'GET',
                    `/admin/realms/${REALM}/organizations?search=${DEVELOPMENT_ORGANIZATION}`,
                )
                return organizations.find(organization => organization.name === DEVELOPMENT_ORGANIZATION)
            },
            create: () => this.api.request('POST', `/admin/realms/${REALM}/organizations`, desired),
            update: existing => this.api.request('PUT', `/admin/realms/${REALM}/organizations/${existing.id}`, desired),
        })
    }

    private async ensureOrgAdminServiceAccountRoles(orgAdminClientId: string): Promise<void> {
        const [realmManagementClient] = await this.api.request<ClientRepresentation[]>(
            'GET',
            `/admin/realms/${REALM}/clients?clientId=${encodeURIComponent(REALM_MANAGEMENT_CLIENT_ID)}`,
        )
        if (!realmManagementClient) {
            throw new Error(`Keycloak client ${REALM_MANAGEMENT_CLIENT_ID} was not found`)
        }
        const serviceAccountUser = await this.api.request<IdentifiedRepresentation>(
            'GET',
            `/admin/realms/${REALM}/clients/${orgAdminClientId}/service-account-user`,
        )
        const availableRoles = await this.api.request<NamedRepresentation[]>(
            'GET',
            `/admin/realms/${REALM}/clients/${realmManagementClient.id}/roles`,
        )
        const existingRoles = await this.api.request<NamedRepresentation[]>(
            'GET',
            `/admin/realms/${REALM}/users/${serviceAccountUser.id}/role-mappings/clients/${realmManagementClient.id}`,
        )
        const existingRoleNames = new Set(existingRoles.map(role => role.name))
        const rolesToGrant = availableRoles.filter(
            role => ORG_ADMIN_SERVICE_ACCOUNT_ROLES.includes(role.name) && !existingRoleNames.has(role.name),
        )
        if (rolesToGrant.length > 0) {
            await this.api.request(
                'POST',
                `/admin/realms/${REALM}/users/${serviceAccountUser.id}/role-mappings/clients/${realmManagementClient.id}`,
                rolesToGrant,
                [204],
            )
        }
    }

    private async ensureClient(desired: ClientRepresentation): Promise<ClientRepresentation> {
        return reconcileResource({
            find: async () => {
                const clients = await this.api.request<ClientRepresentation[]>(
                    'GET',
                    `/admin/realms/${REALM}/clients?clientId=${encodeURIComponent(desired.clientId)}`,
                )
                return clients.find(client => client.clientId === desired.clientId)
            },
            create: () => this.api.request('POST', `/admin/realms/${REALM}/clients`, desired),
            update: existing =>
                this.api.request('PUT', `/admin/realms/${REALM}/clients/${existing.id}`, { ...existing, ...desired }),
        })
    }

    private async ensureClientScope(audienceClientId: string): Promise<NamedRepresentation> {
        const desired: NamedRepresentation = {
            name: AUDIENCE_SCOPE,
            protocol: 'openid-connect',
            attributes: { 'include.in.token.scope': 'false', 'display.on.consent.screen': 'false' },
        }
        const scope = await reconcileResource({
            find: async () => {
                const scopes = await this.api.request<NamedRepresentation[]>(
                    'GET',
                    `/admin/realms/${REALM}/client-scopes`,
                )
                return scopes.find(candidate => candidate.name === AUDIENCE_SCOPE)
            },
            create: () => this.api.request('POST', `/admin/realms/${REALM}/client-scopes`, desired),
            update: existing =>
                this.api.request('PUT', `/admin/realms/${REALM}/client-scopes/${existing.id}`, {
                    ...existing,
                    ...desired,
                }),
        })
        const mappers = await this.api.request<NamedRepresentation[]>(
            'GET',
            `/admin/realms/${REALM}/client-scopes/${scope.id}/protocol-mappers/models`,
        )
        const mapper = {
            name: 'lead-email-finder-api-audience',
            protocol: 'openid-connect',
            protocolMapper: 'oidc-audience-mapper',
            consentRequired: false,
            config: {
                'included.client.audience': audienceClientId,
                'access.token.claim': 'true',
                'id.token.claim': 'false',
                'introspection.token.claim': 'true',
            },
        }
        const existingMapper = mappers.find(candidate => candidate.name === mapper.name)
        if (existingMapper) {
            await this.api.request(
                'PUT',
                `/admin/realms/${REALM}/client-scopes/${scope.id}/protocol-mappers/models/${existingMapper.id}`,
                { ...existingMapper, ...mapper },
            )
        } else {
            await this.api.request(
                'POST',
                `/admin/realms/${REALM}/client-scopes/${scope.id}/protocol-mappers/models`,
                mapper,
            )
        }
        return scope
    }

    private async assignDefaultScope(clientId: string, scopeId: string): Promise<void> {
        const scopes = await this.api.request<NamedRepresentation[]>(
            'GET',
            `/admin/realms/${REALM}/clients/${clientId}/default-client-scopes`,
        )
        if (!scopes.some(scope => scope.id === scopeId)) {
            await this.api.request(
                'PUT',
                `/admin/realms/${REALM}/clients/${clientId}/default-client-scopes/${scopeId}`,
                undefined,
                [204],
            )
        }
    }

    private async ensurePrivilegedBrowserFlow(): Promise<void> {
        const flows = await this.api.request<AuthenticationFlowRepresentation[]>(
            'GET',
            `/admin/realms/${REALM}/authentication/flows`,
        )
        if (!flows.some(flow => flow.alias === BROWSER_FLOW)) {
            await this.api.request('POST', `/admin/realms/${REALM}/authentication/flows`, {
                alias: BROWSER_FLOW,
                description: 'Browser login with MFA required for privileged roles',
                providerId: 'basic-flow',
                topLevel: true,
                builtIn: false,
            })
        }
        await this.ensureExecution(BROWSER_FLOW, 'auth-cookie', 'Cookie', 'ALTERNATIVE')
        await this.ensureExecution(
            BROWSER_FLOW,
            'identity-provider-redirector',
            'Identity Provider Redirector',
            'ALTERNATIVE',
        )
        const topLevelExecutions = await this.getExecutions(BROWSER_FLOW)
        const formsExecution = topLevelExecutions.find(execution => execution.displayName === `${BROWSER_FLOW}-forms`)
        if (formsExecution && !formsExecution.requirementChoices?.includes('ALTERNATIVE')) {
            await this.api.request('DELETE', `/admin/realms/${REALM}/authentication/executions/${formsExecution.id}`)
        }
        if (!formsExecution || !formsExecution.requirementChoices?.includes('ALTERNATIVE')) {
            await this.api.request(
                'POST',
                `/admin/realms/${REALM}/authentication/flows/${BROWSER_FLOW}/executions/flow`,
                {
                    alias: `${BROWSER_FLOW}-forms`,
                    description: 'Username, password, and conditional OTP',
                    provider: 'basic-flow',
                    type: 'basic-flow',
                },
            )
        }
        await this.setExecutionRequirement(BROWSER_FLOW, `${BROWSER_FLOW}-forms`, 'ALTERNATIVE')
        await this.ensureExecution(
            `${BROWSER_FLOW}-forms`,
            'auth-username-password-form',
            'Username Password Form',
            'REQUIRED',
        )
        const otpExecution = await this.ensureExecution(
            `${BROWSER_FLOW}-forms`,
            'auth-conditional-otp-form',
            'Conditional OTP Form',
            'REQUIRED',
        )
        const otpConfig = {
            alias: 'privileged-role-mfa',
            config: { forceOtpRole: 'mfa_required', defaultOtpOutcome: 'skip' },
        }
        if (otpExecution.authenticationConfig) {
            await this.api.request(
                'PUT',
                `/admin/realms/${REALM}/authentication/config/${otpExecution.authenticationConfig}`,
                otpConfig,
            )
        } else {
            await this.api.request(
                'POST',
                `/admin/realms/${REALM}/authentication/executions/${otpExecution.id}/config`,
                otpConfig,
            )
        }
        const realm = await this.api.request<JsonObject>('GET', `/admin/realms/${REALM}`)
        await this.api.request('PUT', `/admin/realms/${REALM}`, { ...realm, browserFlow: BROWSER_FLOW })
    }

    private async ensureExecution(
        flowAlias: string,
        provider: string,
        displayName: string,
        requirement: string,
    ): Promise<AuthenticationExecutionRepresentation> {
        const before = await this.getExecutions(flowAlias)
        let execution = before.find(
            candidate => candidate.providerId === provider || candidate.displayName === displayName,
        )
        if (!execution) {
            await this.api.request(
                'POST',
                `/admin/realms/${REALM}/authentication/flows/${flowAlias}/executions/execution`,
                { provider },
            )
            const previousIds = new Set(before.map(candidate => candidate.id))
            const after = await this.getExecutions(flowAlias)
            execution = after.find(
                candidate =>
                    candidate.providerId === provider ||
                    candidate.displayName === displayName ||
                    !previousIds.has(candidate.id),
            )
        }
        if (!execution) {
            throw new Error(`Authentication execution ${provider} was not created in ${flowAlias}`)
        }
        await this.updateExecutionRequirement(flowAlias, execution, requirement)
        return execution
    }

    private async setExecutionRequirement(
        flowAlias: string,
        displayName: string,
        requirement: string,
    ): Promise<AuthenticationExecutionRepresentation> {
        const executions = await this.getExecutions(flowAlias)
        const execution = executions.find(candidate => candidate.displayName === displayName)
        if (!execution) {
            throw new Error(`Authentication execution ${displayName} was not created in ${flowAlias}`)
        }
        await this.updateExecutionRequirement(flowAlias, execution, requirement)
        return execution
    }

    private getExecutions(flowAlias: string): Promise<AuthenticationExecutionRepresentation[]> {
        return this.api.request<AuthenticationExecutionRepresentation[]>(
            'GET',
            `/admin/realms/${REALM}/authentication/flows/${flowAlias}/executions`,
        )
    }

    private async updateExecutionRequirement(
        flowAlias: string,
        execution: AuthenticationExecutionRepresentation,
        requirement: string,
    ): Promise<void> {
        if (execution.requirement !== requirement) {
            await this.api.request('PUT', `/admin/realms/${REALM}/authentication/flows/${flowAlias}/executions`, {
                ...execution,
                requirement,
            })
        }
    }

    private audienceClient(): ClientRepresentation {
        return {
            clientId: API_AUDIENCE,
            name: 'Lead Email Finder API audience',
            enabled: true,
            protocol: 'openid-connect',
            bearerOnly: true,
            publicClient: false,
            standardFlowEnabled: false,
            implicitFlowEnabled: false,
            directAccessGrantsEnabled: false,
            serviceAccountsEnabled: false,
        }
    }
}
