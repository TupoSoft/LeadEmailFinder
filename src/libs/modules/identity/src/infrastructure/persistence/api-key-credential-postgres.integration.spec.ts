import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { DataSource, EntitySubscriberInterface, InsertEvent } from 'typeorm'
import { AuthPrincipal } from '../../domain/auth-principal'
import { ServiceCredentialDetailRecord } from '../../domain/service-credential-detail-record'
import { AUTH_IDENTITY_ISSUER } from '../../domain/auth-identity-issuer'
import { AuditLogEntry } from './audit-log-entry.entity'
import { Organization } from './organization.entity'
import { ServiceCredential } from './service-credential.entity'
import { TypeOrmActiveServiceCredentialReader } from './typeorm-active-service-credential-reader'
import { TypeOrmServiceCredentialDirectory } from './typeorm-service-credential-directory'
import { TypeOrmServiceCredentialWriter } from './typeorm-service-credential-writer'

const postgresUrl = process.env['TEST_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe

/** Every case uses real transactions in an isolated schema; only audit rejection is injected. */
describeWithPostgres('API-key credential PostgreSQL transactions', () => {
    const schema = `api_key_credentials_${randomUUID().replaceAll('-', '')}`
    let source: DataSource
    let writer: TypeOrmServiceCredentialWriter
    let reader: TypeOrmActiveServiceCredentialReader
    let directory: TypeOrmServiceCredentialDirectory
    let actor: AuthPrincipal
    let rejectAudit = false

    beforeAll(async () => {
        if (!new URL(postgresUrl!).pathname.slice(1).endsWith('_test')) {
            throw new Error('TEST_POSTGRES_URL must select an owned disposable database ending with _test')
        }
        source = new DataSource({
            type: 'postgres',
            url: postgresUrl,
            schema,
            entities: [Organization, ServiceCredential, AuditLogEntry],
            synchronize: false,
        })
        await source.initialize()
        await source.query(`CREATE SCHEMA "${schema}"`)
        await source.synchronize()
        const rejection: EntitySubscriberInterface<AuditLogEntry> = {
            listenTo: () => AuditLogEntry,
            beforeInsert(_event: InsertEvent<AuditLogEntry>) {
                if (rejectAudit) throw new Error('Injected audit failure')
            },
        }
        source.subscribers.push(rejection)
        writer = new TypeOrmServiceCredentialWriter(source)
        reader = new TypeOrmActiveServiceCredentialReader(source.getRepository(ServiceCredential))
        directory = new TypeOrmServiceCredentialDirectory(source.getRepository(ServiceCredential))
    })

    beforeEach(async () => {
        rejectAudit = false
        await source.query(`TRUNCATE TABLE "${schema}".organizations CASCADE`)
        const organization = await source
            .getRepository(Organization)
            .save({ name: 'Synthetic API-key test organization' })
        actor = {
            credentialKind: 'human_session',
            issuer: 'test:human',
            subject: randomUUID(),
            organizationId: organization.id,
            membershipRole: 'owner',
            permissions: ['credentials:manage'],
            credentialId: randomUUID(),
        }
    })

    afterAll(async () => {
        if (source?.isInitialized) {
            try {
                await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            } finally {
                await source.destroy()
            }
        }
    })

    function material(): { apiKey: string; keyHash: string; keyPrefix: string } {
        const apiKey = `lef_${randomBytes(32).toString('base64url')}`
        return { apiKey, keyHash: createHash('sha256').update(apiKey).digest('hex'), keyPrefix: apiKey.slice(0, 12) }
    }
    async function create(
        key = material(),
    ): Promise<{ credential: ServiceCredentialDetailRecord; key: ReturnType<typeof material> }> {
        const id = randomUUID()
        const credential = await writer.createWithAudit({
            id,
            organizationId: actor.organizationId,
            issuer: AUTH_IDENTITY_ISSUER,
            subject: id,
            keyHash: key.keyHash,
            keyPrefix: key.keyPrefix,
            description: null,
            permissions: ['verification:run'],
            actor,
        })
        return { credential, key }
    }

    it('stores only the hash, omits it from all safe records, and reads authoritative permissions without a cache', async () => {
        const { credential, key } = await create()
        const [stored] = await source.query<Array<Record<string, unknown>>>(
            `SELECT * FROM "${schema}".service_credentials WHERE id = $1`,
            [credential.id],
        )
        expect(stored.keyHash).toBe(key.keyHash)
        expect(JSON.stringify(stored)).not.toContain(key.apiKey)
        expect(
            (await source.getRepository(ServiceCredential).findOneBy({ id: credential.id }))?.keyHash,
        ).toBeUndefined()
        const first = await reader.findByKeyHash(key.keyHash)
        expect(first).toMatchObject({ id: credential.id, permissions: ['verification:run'], keyPrefix: key.keyPrefix })
        expect(first).not.toHaveProperty('keyHash')
        expect(await directory.listForOrganization(actor.organizationId)).toEqual([credential])
        await source.getRepository(ServiceCredential).update(credential.id, { permissions: ['billing:read'] })
        expect(await reader.findByKeyHash(key.keyHash)).toMatchObject({ permissions: ['billing:read'] })
        const audits = await source.getRepository(AuditLogEntry).find()
        expect(JSON.stringify(audits)).not.toContain(key.apiKey)
        expect(JSON.stringify(audits)).not.toContain(key.keyHash)
    })

    it('enforces hash uniqueness and rolls the conflicting credential and audit back', async () => {
        const { key } = await create()
        await expect(create(key)).rejects.toMatchObject({ code: '23505' })
        expect(await source.getRepository(ServiceCredential).count()).toBe(1)
        expect(await source.getRepository(AuditLogEntry).count()).toBe(1)
    })

    it('replaces the hash and prefix atomically while preserving identity and permissions', async () => {
        const { credential, key } = await create()
        const replacement = material()
        const outcome = await writer.rotateWithAudit(credential, actor, replacement)
        expect(outcome).toMatchObject({
            kind: 'rotated',
            credential: {
                id: credential.id,
                subject: credential.id,
                keyPrefix: replacement.keyPrefix,
                permissions: credential.permissions,
            },
        })
        expect(await reader.findByKeyHash(key.keyHash)).toBeUndefined()
        expect(await reader.findByKeyHash(replacement.keyHash)).toMatchObject({ id: credential.id })
        expect(JSON.stringify(await source.getRepository(AuditLogEntry).find())).not.toContain(replacement.keyHash)
    })

    it('serializes concurrent rotations so only the last committed key authenticates', async () => {
        const { credential, key } = await create()
        const replacements = [material(), material()]
        const outcomes = await Promise.all(
            replacements.map(replacement => writer.rotateWithAudit(credential, actor, replacement)),
        )
        expect(outcomes.map(outcome => outcome.kind)).toEqual(['rotated', 'rotated'])
        expect(await reader.findByKeyHash(key.keyHash)).toBeUndefined()
        const current = await Promise.all(replacements.map(replacement => reader.findByKeyHash(replacement.keyHash)))
        expect(current.filter(Boolean)).toHaveLength(1)
        expect(await source.getRepository(AuditLogEntry).countBy({ action: 'service_client.rotated' })).toBe(2)
    })

    it('keeps disablement terminal across a concurrent rotation and stale repeated rotation', async () => {
        const { credential, key } = await create()
        const replacement = material()
        const [rotation, disabled] = await Promise.all([
            writer.rotateWithAudit(credential, actor, replacement),
            writer.disableWithAudit(credential, actor),
        ])
        expect(['rotated', 'disabled']).toContain(rotation.kind)
        expect(disabled).toBe('disabled')
        expect(await directory.findByIdForOrganization(credential.id, actor.organizationId)).toMatchObject({
            status: 'disabled',
        })
        expect(await writer.rotateWithAudit(credential, actor, material())).toEqual({ kind: 'disabled' })
        expect(await writer.disableWithAudit(credential, actor)).toBe('already-disabled')
        for (const hash of [key.keyHash, replacement.keyHash]) {
            const current = await reader.findByKeyHash(hash)
            expect(current?.status).not.toBe('active')
        }
        expect(await source.getRepository(AuditLogEntry).countBy({ action: 'service_client.disabled' })).toBe(1)
    })

    it('never recreates a concurrently deleted credential through rotation or disablement', async () => {
        const { credential } = await create()
        const [rotation, deleted] = await Promise.all([
            writer.rotateWithAudit(credential, actor, material()),
            writer.deleteWithAudit(credential, actor),
        ])
        expect(['rotated', 'not-found']).toContain(rotation.kind)
        expect(deleted).toBe('deleted')
        expect(await directory.findByIdForOrganization(credential.id, actor.organizationId)).toBeUndefined()
        expect(await writer.rotateWithAudit(credential, actor, material())).toEqual({ kind: 'not-found' })
        expect(await writer.disableWithAudit(credential, actor)).toBe('not-found')
        expect(await writer.deleteWithAudit(credential, actor)).toBe('not-found')
    })

    it('rolls creation back when audit insertion fails', async () => {
        rejectAudit = true
        await expect(create()).rejects.toThrow('Injected audit failure')
        expect(await source.getRepository(ServiceCredential).count()).toBe(0)
    })

    it.each(['rotate', 'disable', 'delete'] as const)('rolls %s back when audit insertion fails', async operation => {
        const { credential, key } = await create()
        rejectAudit = true
        const mutation =
            operation === 'rotate'
                ? writer.rotateWithAudit(credential, actor, material())
                : operation === 'disable'
                  ? writer.disableWithAudit(credential, actor)
                  : writer.deleteWithAudit(credential, actor)
        await expect(mutation).rejects.toThrow('Injected audit failure')
        expect(await reader.findByKeyHash(key.keyHash)).toMatchObject({
            id: credential.id,
            status: 'active',
            keyPrefix: key.keyPrefix,
        })
        expect(await source.getRepository(AuditLogEntry).count()).toBe(1)
    })

    it('conceals foreign organizations in every persistence mutation without changing the key', async () => {
        const { credential, key } = await create()
        const foreign = { ...credential, organizationId: randomUUID() }
        expect(await writer.rotateWithAudit(foreign, actor, material())).toEqual({ kind: 'not-found' })
        expect(await writer.disableWithAudit(foreign, actor)).toBe('not-found')
        expect(await writer.deleteWithAudit(foreign, actor)).toBe('not-found')
        expect(await reader.findByKeyHash(key.keyHash)).toMatchObject({ status: 'active' })
    })
})
