import pg from 'pg'

// The seeded customer-fixture M2M client is deliberately member-scoped (see customer-fixture.ts), excluding
// billing:*, so it cannot read its own organization's billing summary. Only this narrow, restorable elevation
// on the checkout-owned development database (never a schema or permission-policy change) lets the
// credit-purchases reservation fixture prove billing-summary accounting against that same isolated organization.
export async function withBillingReadForCustomerFixture(
    metadata,
    issuer,
    keycloakClientId,
    run,
    clientFactory = config => new pg.Client(config),
) {
    const client = clientFactory({ connectionString: metadata.postgresUrl })
    await client.connect()
    try {
        const { rows } = await client.query(
            'SELECT permissions FROM service_credentials WHERE issuer = $1 AND "keycloakClientId" = $2',
            [issuer, keycloakClientId],
        )
        if (rows.length !== 1) throw new Error('Customer fixture service credential is missing')
        // pg has no registered parser for this custom enum array OID, so it returns the raw Postgres array
        // literal text (e.g. "{verification:run,verification:read}") instead of a JS array.
        const originalPermissions = rows[0].permissions.slice(1, -1).split(',').filter(Boolean)
        if (originalPermissions.includes('billing:read')) return await run()
        const elevated = [...originalPermissions, 'billing:read']
        await client.query(
            'UPDATE service_credentials SET permissions = $1::"auth_permission"[] WHERE issuer = $2 AND "keycloakClientId" = $3',
            [elevated, issuer, keycloakClientId],
        )
        try {
            return await run()
        } finally {
            await client.query(
                'UPDATE service_credentials SET permissions = $1::"auth_permission"[] WHERE issuer = $2 AND "keycloakClientId" = $3',
                [originalPermissions, issuer, keycloakClientId],
            )
        }
    } finally {
        await client.end()
    }
}
