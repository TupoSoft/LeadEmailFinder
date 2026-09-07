import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'

// Only the launcher supplies a verified checkout-owned development database.
// A past timestamp proves expiry without waiting for the invitation TTL.
export async function withExpiredInvitation(metadata, organizationId, issuer, run, clientFactory = config => new pg.Client(config)) {
    const client = clientFactory({ connectionString: metadata.postgresUrl })
    const id = randomUUID()
    const token = randomBytes(32).toString('base64url')
    const hash = createHash('sha256').update(token).digest('hex')
    await client.connect()
    try {
        await client.query(
            `INSERT INTO organization_invitations
             (id, "organizationId", email, role, "tokenHash", status, "expiresAt",
              "invitedByCredentialKind", "invitedByIssuer", "invitedBySubject", "invitedByCredentialId")
             VALUES ($1, $2, $3, 'member', $4, 'pending', $5, 'service_client', $6, $7, $7)`,
            [id, organizationId, `expired-${id}@example.test`, hash, new Date(0), issuer, 'bruno-expiry-fixture'],
        )
        return await run(token)
    } finally {
        try {
            await client.query('DELETE FROM organization_invitations WHERE id = $1 AND "organizationId" = $2', [id, organizationId])
        } finally {
            await client.end()
        }
    }
}
