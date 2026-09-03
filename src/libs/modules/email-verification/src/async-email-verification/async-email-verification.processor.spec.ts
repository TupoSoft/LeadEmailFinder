import { Job } from 'bullmq'
import {
    EmailPatternEnum,
    EmailVerificationReason,
    IEmailVerificationResponseDto,
    IEmailVerificationService,
} from '@tuposoft/lead-email-finder/common'
import { AsyncEmailVerificationJobData } from './async-email-verification-job-data.interface'
import { AsyncEmailVerificationProcessor } from './async-email-verification.processor'
import { GreylistedException } from './greylisted.exception'

describe('AsyncEmailVerificationProcessor', () => {
    it('passes an explicit organization-scoped command without the credential id', async () => {
        const result: IEmailVerificationResponseDto = {
            email: 'person@lef.test',
            domain: 'lef.test',
            localPart: 'person',
            format: EmailPatternEnum.First,
            sources: [],
            exists: true,
            catchAll: false,
            reason: EmailVerificationReason.AcceptedEmail,
            createdAt: new Date('2026-08-31T00:00:00.000Z'),
        }
        const emailVerificationService: jest.Mocked<IEmailVerificationService> = {
            verify: jest.fn().mockResolvedValue(result),
        }
        const processor = new AsyncEmailVerificationProcessor(emailVerificationService)
        const job = {
            data: {
                organizationId: 'org-1',
                credentialId: 'cred-1',
                email: 'person@lef.test',
                format: EmailPatternEnum.First,
                batchId: 'batch-1',
            },
        } as Job<AsyncEmailVerificationJobData, IEmailVerificationResponseDto>

        await expect(processor.process(job)).resolves.toBe(result)
        expect(emailVerificationService.verify).toHaveBeenCalledWith({
            organizationId: 'org-1',
            email: 'person@lef.test',
            format: EmailPatternEnum.First,
            batchId: 'batch-1',
        })
    })

    it('preserves greylist retry classification without putting the address in the exception message', async () => {
        const sentinel = 'unique-person@private.example'
        const result: IEmailVerificationResponseDto = {
            email: sentinel,
            domain: 'private.example',
            localPart: 'unique-person',
            sources: [],
            exists: null,
            catchAll: null,
            reason: EmailVerificationReason.TemporarilyBlocked,
            createdAt: new Date('2026-09-03T00:00:00.000Z'),
        }
        const emailVerificationService: jest.Mocked<IEmailVerificationService> = {
            verify: jest.fn().mockResolvedValue(result),
        }
        const processor = new AsyncEmailVerificationProcessor(emailVerificationService)
        const job = {
            data: {
                organizationId: 'org-1',
                credentialId: 'cred-1',
                email: sentinel,
            },
        } as Job<AsyncEmailVerificationJobData, IEmailVerificationResponseDto>

        const error = await processor.process(job).catch((caughtError: unknown) => caughtError)

        expect(error).toBeInstanceOf(GreylistedException)
        expect((error as Error).message).toBe('Email verification is temporarily greylisted.')
        expect((error as Error).message).not.toContain(sentinel)
    })
})
