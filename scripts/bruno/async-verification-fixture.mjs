import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import { readApiKeyFixture } from '../better-auth/api-key-files.mjs'
import { inspectDevelopmentService, loadDevelopmentStack } from '../testing/development-stack.mjs'
import { baseFailureDiagnostic, brunoFailure, failureDiagnostic } from './failure-diagnostic.mjs'

const customerSchema = z.object({
    issuer: z.string().url(),
    organizationId: z.string().uuid(),
    credentialId: z.string().uuid(),
    keyPrefix: z.string().length(12),
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
export async function withAsyncVerificationFixture(checkoutRoot, execute) {
    const metadata = loadDevelopmentStack(checkoutRoot)
    for (const service of ['smtp-evidence', 'plaintext-mailpit', 'coredns', 'smtp-dev-proxy']) {
        inspectDevelopmentService(checkoutRoot, metadata, service)
    }
    const readMetadata = async name => JSON.parse(await readFile(resolve(checkoutRoot, '.dev/keycloak', name), 'utf8'))
    const platform = await readApiKeyFixture(checkoutRoot, metadata, 'platform')
    const customerKey = await readApiKeyFixture(checkoutRoot, metadata, 'customer')
    const issuer = `${metadata.keycloakUrl}/realms/lead-email-finder`
    const customer = validateCustomerFixture(
        await readMetadata('customer-fixture.json'),
        issuer,
        platform.organizationId,
    )
    if (customer.credentialId !== customerKey.credentialId || customer.organizationId !== customerKey.organizationId) {
        throw new Error('Customer API-key fixture does not match customer seed metadata')
    }
    const lock = resolve(checkoutRoot, '.dev/async-verification.lock')
    await mkdir(lock, { mode: 0o700 })
    try {
        const creditRequest = async (method, amount) => {
            inspectDevelopmentService(checkoutRoot, metadata, 'api')
            return jsonResponse(
                await fetch(`${metadata.apiUrl}/credits/${customer.organizationId}`, {
                    method,
                    headers: { authorization: `Bearer ${platform.apiKey}`, 'content-type': 'application/json' },
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
                    CUSTOMER_API_KEY: customerKey.apiKey,
                },
                setBalance,
            }),
        )
    } finally {
        await rm(lock, { recursive: true })
    }
}
