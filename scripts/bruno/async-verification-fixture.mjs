import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { inspectDevelopmentService, loadDevelopmentStack } from '../testing/development-stack.mjs'
import { baseFailureDiagnostic, brunoFailure, failureDiagnostic } from './failure-diagnostic.mjs'

const customerSchema = z.object({
    issuer: z.string().url(),
    organizationId: z.string().uuid(),
    keycloakClientId: z.literal('lef-svc-dev-fixture'),
    issuers: z.array(z.string().url()),
})

export function validateCustomerFixture(value, issuer, platformOrganizationId) {
    const customer = customerSchema.parse(value)
    if (
        customer.issuer !== issuer ||
        !customer.issuers.includes(issuer) ||
        customer.organizationId === platformOrganizationId
    ) {
        throw new Error(
            'Async verification requires the separately seeded customer organization and current public issuer',
        )
    }
    return customer
}

async function jsonResponse(response) {
    if (!response.ok) {
        const status = response.status
        throw brunoFailure({
            stage: 'fixture_bootstrap',
            ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
        })
    }
    return response.json()
}

export async function customerClientSecret(metadata, clientId, fetchImpl = fetch, { orgAdmin } = {}) {
    const issuer = `${metadata.keycloakUrl}/realms/lead-email-finder`
    if (
        orgAdmin !== undefined &&
        (!orgAdmin ||
            orgAdmin.issuer !== issuer ||
            orgAdmin.clientId !== 'lef-org-admin-service' ||
            typeof orgAdmin.clientSecret !== 'string' ||
            !orgAdmin.clientSecret ||
            clientId !== 'lef-svc-dev-fixture')
    )
        throw new Error('Batch verification requires matching organization administration credentials')
    const tokenIssuer = orgAdmin ? issuer : `${metadata.keycloakUrl}/realms/master`
    const credentials = orgAdmin
        ? { grant_type: 'client_credentials', client_id: orgAdmin.clientId, client_secret: orgAdmin.clientSecret }
        : {
              grant_type: 'password',
              client_id: 'admin-cli',
              username: metadata.keycloakAdminUsername,
              password: metadata.keycloakAdminPassword,
          }
    const { access_token: token } = await jsonResponse(
        await fetchImpl(`${tokenIssuer}/protocol/openid-connect/token`, {
            method: 'POST',
            body: new URLSearchParams(credentials),
            signal: AbortSignal.timeout(15_000),
        }),
    )
    if (typeof token !== 'string' || !token) throw new Error('Async verification fixture admin token is missing')
    if (orgAdmin) {
        let claims
        try {
            claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
        } catch {
            throw new Error('Organization administration token identity could not be confirmed')
        }
        if (claims?.iss !== issuer || claims.azp !== orgAdmin.clientId)
            throw new Error('Organization administration token identity did not match')
    }
    const headers = { authorization: `Bearer ${token}` }
    const clients = await jsonResponse(
        await fetchImpl(
            `${metadata.keycloakUrl}/admin/realms/lead-email-finder/clients?clientId=${encodeURIComponent(clientId)}`,
            { headers, signal: AbortSignal.timeout(15_000) },
        ),
    )
    const matches = Array.isArray(clients) ? clients.filter(client => client.clientId === clientId) : []
    if (matches.length !== 1 || typeof matches[0].id !== 'string') throw new Error('Seeded customer client is missing')
    const { value } = await jsonResponse(
        await fetchImpl(
            `${metadata.keycloakUrl}/admin/realms/lead-email-finder/clients/${encodeURIComponent(matches[0].id)}/client-secret`,
            { headers, signal: AbortSignal.timeout(15_000) },
        ),
    )
    if (typeof value !== 'string' || !value) throw new Error('Seeded customer client secret is missing')
    return value
}

export async function withRestoredBalance(creditRequest, execute) {
    const { balance } = await creditRequest('GET')
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Fixture balance must be a nonnegative integer')
    const restore = async prior => {
        let operation = 'write'
        try {
            const restored = await creditRequest('PUT', balance)
            if (restored.balance !== balance) {
                throw brunoFailure({ stage: 'balance_restore' })
            }
            operation = 'confirmation'
            if ((await creditRequest('GET')).balance !== balance) {
                throw brunoFailure({ stage: 'balance_restore' })
            }
        } catch (error) {
            const { status } = failureDiagnostic(error)
            throw brunoFailure({
                stage: 'balance_restore',
                operation,
                ...(status === undefined ? {} : { status }),
                ...(prior === undefined ? {} : { prior }),
            })
        }
    }
    let prior
    try {
        return await execute(async amount => {
            if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid fixture balance')
            const result = await creditRequest('PUT', amount)
            if (result.balance !== amount) throw new Error('Fixture balance update was not confirmed')
        })
    } catch (error) {
        prior = baseFailureDiagnostic(error)
        throw error
    } finally {
        await restore(prior)
    }
}

// Ownership is verified before reading seed material or changing credits. The exclusive lock prevents the
// Bruno and live browser suites from changing the seeded customer's balance concurrently.
export async function withAsyncVerificationFixture(checkoutRoot, execute, { useOrganizationAdmin = false } = {}) {
    const metadata = loadDevelopmentStack(checkoutRoot)
    for (const service of ['mailpit', 'plaintext-mailpit', 'coredns', 'smtp-dev-proxy']) {
        inspectDevelopmentService(checkoutRoot, metadata, service)
    }
    const readMetadata = async name => JSON.parse(await readFile(resolve(checkoutRoot, '.dev/keycloak', name), 'utf8'))
    const platform = await readMetadata('service-client.json')
    const credential = await readMetadata('service-credential.json')
    const issuer = `${metadata.keycloakUrl}/realms/lead-email-finder`
    if (
        platform.issuer !== issuer ||
        credential.keycloakClientId !== platform.clientId ||
        !credential.issuers?.includes(issuer) ||
        typeof platform.clientSecret !== 'string' ||
        !platform.clientSecret
    ) {
        throw new Error('Async verification requires matching platform credential metadata')
    }
    const customer = validateCustomerFixture(
        await readMetadata('customer-fixture.json'),
        issuer,
        credential.organizationId,
    )
    const secret = await customerClientSecret(metadata, customer.keycloakClientId, fetch, {
        ...(useOrganizationAdmin ? { orgAdmin: await readMetadata('org-admin-client.json') } : {}),
    })
    const lock = resolve(checkoutRoot, '.dev/async-verification.lock')
    await mkdir(lock, { mode: 0o700 })
    try {
        const creditRequest = async (method, amount) => {
            inspectDevelopmentService(checkoutRoot, metadata, 'api')
            const { access_token: token } = await jsonResponse(
                await fetch(`${issuer}/protocol/openid-connect/token`, {
                    method: 'POST',
                    body: new URLSearchParams({
                        grant_type: 'client_credentials',
                        client_id: platform.clientId,
                        client_secret: platform.clientSecret,
                    }),
                    signal: AbortSignal.timeout(15_000),
                }),
            )
            if (typeof token !== 'string' || !token) throw new Error('Fixture platform token is missing')
            return jsonResponse(
                await fetch(`${metadata.apiUrl}/credits/${customer.organizationId}`, {
                    method,
                    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                    ...(method === 'PUT' ? { body: JSON.stringify({ amount }) } : {}),
                    signal: AbortSignal.timeout(15_000),
                }),
            )
        }
        return await withRestoredBalance(creditRequest, setBalance =>
            execute({
                origin: metadata.apiUrl,
                organizationId: customer.organizationId,
                environment: {
                    CUSTOMER_ORGANIZATION_ID: customer.organizationId,
                    CUSTOMER_SERVICE_CLIENT_ID: customer.keycloakClientId,
                    CUSTOMER_SERVICE_CLIENT_SECRET: secret,
                },
                setBalance,
            }),
        )
    } finally {
        await rm(lock, { recursive: true })
    }
}
