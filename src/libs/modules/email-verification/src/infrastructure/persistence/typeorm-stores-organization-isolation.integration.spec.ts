import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { TypeOrmEmailStore } from './typeorm-email.store'
import { TypeOrmSmtpVerificationStore } from './typeorm-smtp-verification.store'
import { TypeOrmVerificationStore } from './typeorm-verification.store'
import { DomainPolicyEntity } from './typeorm/domain-policy.entity'
import { EmailEntity } from './typeorm/email.entity'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'
import { SmtpVerificationEntity } from './typeorm/smtp-verification.entity'

const postgresUrl = process.env['TEST_EMAIL_VERIFICATION_PERSISTENCE_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe
const schema = `email_verification_persistence_${process.pid}`
const entities = [DomainPolicyEntity, EmailEntity, EmailVerificationEntity, SmtpVerificationEntity]

describeWithPostgres('email-verification persistence stores organization isolation', () => {
    let dataSource: DataSource
    let emailStore: TypeOrmEmailStore
    let verificationStore: TypeOrmVerificationStore
    let smtpVerificationStore: TypeOrmSmtpVerificationStore

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_POSTGRES_URL must select a database whose name ends with _test')
        }

        dataSource = new DataSource({
            type: 'postgres',
            url: postgresUrl,
            schema,
            synchronize: false,
            entities,
        })
        await dataSource.initialize()
        await dataSource.query(`CREATE SCHEMA "${schema}"`)
        await dataSource.synchronize()

        emailStore = new TypeOrmEmailStore(dataSource.getRepository(EmailEntity))
        verificationStore = new TypeOrmVerificationStore(dataSource.getRepository(EmailVerificationEntity))
        smtpVerificationStore = new TypeOrmSmtpVerificationStore(dataSource.getRepository(SmtpVerificationEntity))
    })

    afterAll(async () => {
        if (!dataSource?.isInitialized) return

        await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        await dataSource.destroy()
    })

    it('keeps identical addresses isolated across organizations for every organization-owned store', async () => {
        const organizationAId = randomUUID()
        const organizationBId = randomUUID()
        const address = 'person@example.test'

        await emailStore.create(organizationAId, { id: address, exists: true })
        await emailStore.create(organizationBId, { id: address, exists: false })

        await expect(emailStore.findByAddress(organizationAId, address)).resolves.toMatchObject({ exists: true })
        await expect(emailStore.findByAddress(organizationBId, address)).resolves.toMatchObject({ exists: false })

        const verificationA = await verificationStore.create(organizationAId, {
            email: address,
            domain: 'example.test',
            localPart: 'person',
            exists: true,
            catchAll: false,
            reason: 'accepted_email' as never,
            sources: [],
        })
        const verificationB = await verificationStore.create(organizationBId, {
            email: address,
            domain: 'example.test',
            localPart: 'person',
            exists: false,
            catchAll: false,
            reason: 'rejected_email' as never,
            sources: [],
        })

        expect(verificationA.id).not.toBe(verificationB.id)
        expect(verificationA.organizationId).toBe(organizationAId)
        expect(verificationB.organizationId).toBe(organizationBId)

        await smtpVerificationStore.upsert(organizationAId, address, {
            reason: 'accepted_email',
            exists: true,
            secureTransport: true,
        })
        await smtpVerificationStore.upsert(organizationBId, address, {
            reason: 'rejected_email',
            exists: false,
            secureTransport: true,
        })

        await expect(smtpVerificationStore.findByAddress(organizationAId, address)).resolves.toMatchObject({
            exists: true,
            reason: 'accepted_email',
        })
        await expect(smtpVerificationStore.findByAddress(organizationBId, address)).resolves.toMatchObject({
            exists: false,
            reason: 'rejected_email',
        })
    })

    it('leaves the shared domain-policy table with no organization association', () => {
        const domainMetadata = dataSource.getMetadata(DomainPolicyEntity)
        expect(domainMetadata.findColumnWithPropertyName('organizationId')).toBeUndefined()
    })
})
