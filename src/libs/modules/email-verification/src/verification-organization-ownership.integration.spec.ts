import { Upload } from '@aws-sdk/lib-storage'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { EmailVerificationReason, EmailVerificationSource } from '@tuposoft/lead-email-finder/common'
import { S3BatchResultWriter } from './infrastructure/storage/batch-verification/s3-batch-result-writer'
import { DomainPolicyEntity } from './infrastructure/persistence/typeorm/domain-policy.entity'
import { EmailEntity } from './infrastructure/persistence/typeorm/email.entity'
import { EmailVerificationEntity } from './infrastructure/persistence/typeorm/email-verification.entity'
import { TypeOrmVerificationStore } from './infrastructure/persistence/typeorm-verification.store'
import { SmtpVerificationEntity } from './infrastructure/persistence/typeorm/smtp-verification.entity'
import { TypeOrmSmtpVerificationStore } from './infrastructure/persistence/typeorm-smtp-verification.store'
import { SmtpMailboxProbe } from './infrastructure/mailbox/smtp/smtp-mailbox-probe'
import { SmtpVerificationReason } from './infrastructure/mailbox/smtp/smtp.enums'
import { EmailVerificationOrchestrator } from './application/email-verification.service'
import { DomainPolicyService } from './application/domain-policy.service'
import { EmailAdministrationService } from './application/email-administration.service'
import { MailboxVerificationService } from './application/mailbox-verification.service'
import { TypeOrmVerificationResultReader } from './infrastructure/typeorm-verification-result-reader'

jest.mock('@aws-sdk/lib-storage')

const postgresUrl = process.env['TEST_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe
const schema = `verification_ownership_${process.pid}`
const entities = [DomainPolicyEntity, EmailEntity, EmailVerificationEntity, SmtpVerificationEntity]

interface UploadParams {
    Body: NodeJS.ReadableStream
}

describeWithPostgres('verification organization ownership', () => {
    let dataSource: DataSource

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
    })

    afterAll(async () => {
        if (!dataSource?.isInitialized) return

        await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        await dataSource.destroy()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('synchronizes the tenant-owned keys and indexes while domains remain shared', async () => {
        const emailMetadata = dataSource.getMetadata(EmailEntity)
        const verificationMetadata = dataSource.getMetadata(EmailVerificationEntity)
        const smtpMetadata = dataSource.getMetadata(SmtpVerificationEntity)
        const domainMetadata = dataSource.getMetadata(DomainPolicyEntity)

        expect(emailMetadata.primaryColumns.map(column => column.propertyName)).toEqual(['organizationId', 'id'])
        expect(smtpMetadata.primaryColumns.map(column => column.propertyName)).toEqual(['organizationId', 'id'])
        expect(verificationMetadata.findColumnWithPropertyName('organizationId')?.isNullable).toBe(false)
        expect(domainMetadata.findColumnWithPropertyName('organizationId')).toBeUndefined()

        expect(verificationMetadata.indices.map(index => index.columns.map(column => column.propertyName))).toEqual(
            expect.arrayContaining([
                ['organizationId', 'email', 'createdAt'],
                ['organizationId', 'batchId'],
            ]),
        )
        expect(emailMetadata.indices.map(index => index.columns.map(column => column.propertyName))).toContainEqual([
            'organizationId',
            'updatedAt',
        ])
        expect(smtpMetadata.indices.map(index => index.columns.map(column => column.propertyName))).toContainEqual([
            'organizationId',
            'updatedAt',
        ])

        const organizationColumns = await dataSource.query<Array<{ table_name: string; is_nullable: string }>>(
            `SELECT table_name, is_nullable
             FROM information_schema.columns
             WHERE table_schema = $1
               AND column_name = 'organizationId'
             ORDER BY table_name`,
            [schema],
        )

        expect(organizationColumns).toEqual([
            { table_name: 'email_verifications', is_nullable: 'NO' },
            { table_name: 'emails', is_nullable: 'NO' },
            { table_name: 'smtp_verifications', is_nullable: 'NO' },
        ])
    })

    it('keeps identical email, verification, and SMTP cache records isolated by organization', async () => {
        const organizationAId = randomUUID()
        const organizationBId = randomUUID()
        const address = 'person@example.test'
        const emailRepository = dataSource.getRepository(EmailEntity)
        const verificationRepository = dataSource.getRepository(EmailVerificationEntity)
        const smtpRepository = dataSource.getRepository(SmtpVerificationEntity)

        await dataSource.getRepository(DomainPolicyEntity).save({ id: 'example.test' })
        const [emailA, emailB] = await emailRepository.save([
            emailRepository.create({
                organizationId: organizationAId,
                id: address,
                username: 'person',
                domain: 'example.test',
                exists: true,
            }),
            emailRepository.create({
                organizationId: organizationBId,
                id: address,
                username: 'person',
                domain: 'example.test',
                exists: false,
            }),
        ])
        const [verificationA, verificationB] = await verificationRepository.save([
            verificationRepository.create({
                organizationId: organizationAId,
                email: address,
                domain: 'example.test',
                localPart: 'person',
                exists: true,
                catchAll: false,
                reason: EmailVerificationReason.AcceptedEmail,
                sources: [EmailVerificationSource.MX],
                verificationQuality: 'conclusive_positive',
                evidenceObservedAt: new Date(),
                evidencePolicyVersion: 1,
            }),
            verificationRepository.create({
                organizationId: organizationBId,
                email: address,
                domain: 'example.test',
                localPart: 'person',
                exists: false,
                catchAll: false,
                reason: EmailVerificationReason.RejectedEmail,
                sources: [EmailVerificationSource.MX],
                verificationQuality: 'conclusive_negative',
                evidenceObservedAt: new Date(),
                evidencePolicyVersion: 1,
            }),
        ])

        emailA.lastVerificationId = verificationA.id
        emailB.lastVerificationId = verificationB.id
        await emailRepository.save([emailA, emailB])

        await smtpRepository.save([
            smtpRepository.create({
                organizationId: organizationAId,
                id: address,
                exists: true,
                reason: SmtpVerificationReason.AcceptedEmail,
                secureTransport: true,
                evidenceObservedAt: new Date(),
                evidencePolicyVersion: 1,
            }),
            smtpRepository.create({
                organizationId: organizationBId,
                id: address,
                exists: false,
                reason: SmtpVerificationReason.RejectedEmail,
                secureTransport: true,
                evidenceObservedAt: new Date(),
                evidencePolicyVersion: 1,
            }),
        ])

        await expect(
            emailRepository.findOneByOrFail({ organizationId: organizationAId, id: address }),
        ).resolves.toEqual(expect.objectContaining({ exists: true, lastVerificationId: verificationA.id }))
        await expect(
            emailRepository.findOneByOrFail({ organizationId: organizationBId, id: address }),
        ).resolves.toEqual(expect.objectContaining({ exists: false, lastVerificationId: verificationB.id }))
        await expect(
            verificationRepository.findOneBy({ organizationId: organizationAId, id: verificationB.id }),
        ).resolves.toBeNull()

        const resultReader = new TypeOrmVerificationResultReader(verificationRepository)
        await expect(
            resultReader.findOwned({ organizationId: organizationAId, id: verificationA.id }),
        ).resolves.toEqual(expect.objectContaining({ id: verificationA.id, email: address, exists: true }))
        await expect(
            resultReader.findOwned({ organizationId: organizationBId, id: verificationB.id }),
        ).resolves.toEqual(expect.objectContaining({ id: verificationB.id, email: address, exists: false }))
        await expect(
            resultReader.findOwned({ organizationId: organizationAId, id: verificationB.id }),
        ).resolves.toBeNull()
        await expect(resultReader.findOwned({ organizationId: organizationAId, id: randomUUID() })).resolves.toBeNull()

        const dnsService = { resolve: jest.fn() }
        const mxResolver = { resolve: jest.fn() }
        const clock = { now: () => new Date() }
        const smtpMailboxProbe = new SmtpMailboxProbe(
            dnsService as never,
            mxResolver,
            { addToBlacklist: jest.fn() } as never,
            { acquire: jest.fn(), release: jest.fn() } as never,
            { create: jest.fn() } as never,
            new TypeOrmSmtpVerificationStore(smtpRepository),
            { onConnectionOutcome: jest.fn() } as never,
            clock,
        )

        await expect(smtpMailboxProbe.probe(organizationAId, address)).resolves.toEqual(
            expect.objectContaining({ email: address, exists: true }),
        )
        await expect(smtpMailboxProbe.probe(organizationBId, address)).resolves.toEqual(
            expect.objectContaining({ email: address, exists: false }),
        )
        expect(dnsService.resolve).not.toHaveBeenCalled()
        expect(mxResolver.resolve).not.toHaveBeenCalled()

        const smtpRows = await smtpRepository.findBy({ id: address })
        expect(smtpRows).toHaveLength(2)
        expect(smtpRows.every(row => row.createdAt instanceof Date && row.updatedAt instanceof Date)).toBe(true)
    })

    it('preserves an earlier batch after reverification and exports only its owning organization', async () => {
        const organizationAId = randomUUID()
        const organizationBId = randomUUID()
        const batchId = randomUUID()
        const verificationRepository = dataSource.getRepository(EmailVerificationEntity)

        const [ownedBatchVerification] = await verificationRepository.save([
            verificationRepository.create({
                organizationId: organizationAId,
                email: 'owned@example.test',
                domain: 'example.test',
                localPart: 'owned',
                exists: true,
                catchAll: false,
                reason: EmailVerificationReason.AcceptedEmail,
                sources: [EmailVerificationSource.MX],
                batchId,
                verificationQuality: 'conclusive_positive',
                evidenceObservedAt: new Date(),
                evidencePolicyVersion: 1,
            }),
            verificationRepository.create({
                organizationId: organizationBId,
                email: 'foreign@example.test',
                domain: 'example.test',
                localPart: 'foreign',
                exists: false,
                catchAll: false,
                reason: EmailVerificationReason.RejectedEmail,
                sources: [EmailVerificationSource.MX],
                batchId,
                verificationQuality: 'conclusive_negative',
                evidenceObservedAt: new Date(),
                evidencePolicyVersion: 1,
            }),
        ])

        const laterVerification = new EmailVerificationOrchestrator(
            {
                verify: jest.fn().mockResolvedValue({
                    email: 'owned@example.test',
                    domain: 'example.test',
                    localPart: 'owned',
                    exists: false,
                    catchAll: false,
                    reason: EmailVerificationReason.RejectedEmail,
                    sources: [EmailVerificationSource.MX],
                    verificationQuality: 'conclusive_negative',
                    evidenceObservedAt: new Date(),
                    evidencePolicyVersion: 1,
                }),
            } as unknown as MailboxVerificationService,
            new TypeOrmVerificationStore(verificationRepository),
            {
                upsertEmail: jest
                    .fn()
                    .mockResolvedValueOnce({
                        email: 'owned@example.test',
                        username: 'owned',
                        domain: 'example.test',
                        exists: true,
                        lastVerificationId: ownedBatchVerification.id,
                        createdAt: ownedBatchVerification.createdAt,
                        updatedAt: ownedBatchVerification.createdAt,
                    })
                    .mockResolvedValueOnce({
                        email: 'owned@example.test',
                        username: 'owned',
                        domain: 'example.test',
                        exists: false,
                        createdAt: ownedBatchVerification.createdAt,
                        updatedAt: ownedBatchVerification.createdAt,
                    }),
            } as unknown as EmailAdministrationService,
            { isVerificationAllowed: jest.fn().mockResolvedValue(true) } as unknown as DomainPolicyService,
        )

        await laterVerification.verify({ organizationId: organizationAId, email: 'owned@example.test' })

        await expect(verificationRepository.findOneByOrFail({ id: ownedBatchVerification.id })).resolves.toEqual(
            expect.objectContaining({ organizationId: organizationAId, batchId }),
        )

        const chunks: Buffer[] = []
        ;(Upload as unknown as jest.Mock).mockImplementation(({ params }: { params: UploadParams }) => {
            params.Body.on('data', (chunk: Buffer) => chunks.push(chunk))
            return {
                done: () =>
                    new Promise((resolve, reject) => {
                        params.Body.on('end', resolve)
                        params.Body.on('error', reject)
                    }),
            }
        })

        const resultWriter = new S3BatchResultWriter(
            {} as never,
            {
                mode: 'development-local',
                cacheControl: 'no-store',
            },
            verificationRepository,
            dataSource,
        )

        await resultWriter.write('bucket', `organizations/${organizationAId}/uploads/input.csv`, organizationAId, batchId)

        const csv = Buffer.concat(chunks).toString('utf8')
        expect(csv).toContain('owned@example.test')
        expect(csv).not.toContain('foreign@example.test')
        expect(csv.slice(0, csv.indexOf('\n')).split(',')).not.toContain('organizationId')
    })
})
