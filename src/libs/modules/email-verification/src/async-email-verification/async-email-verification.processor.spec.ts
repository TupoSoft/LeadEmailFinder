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
            id: '6b263662-0f5d-4013-a705-7432665a291e',
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
            id: 'job-1',
            attemptsMade: 0,
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
            trace: {
                operationId: 'job-1',
                mode: 'batch_child',
                jobId: 'job-1',
                batchId: 'batch-1',
                attempt: 1,
            },
        })
    })

    it('preserves greylist retry classification without putting the address in the exception message', async () => {
        const sentinel = 'unique-person@private.example'
        const result: IEmailVerificationResponseDto = {
            id: '6b263662-0f5d-4013-a705-7432665a291e',
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
            id: 'job-1',
            attemptsMade: 0,
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
    it('retains the job operation ID across retries and duplicate deliveries', async () => {
        const error = new Error('sentinel@private.example provider text')
        const emailVerificationService: jest.Mocked<IEmailVerificationService> = {
            verify: jest.fn().mockRejectedValue(error),
        }
        const processor = new AsyncEmailVerificationProcessor(emailVerificationService)
        const job = {
            id: 'stable-job-id',
            attemptsMade: 0,
            data: { organizationId: 'org-1', credentialId: 'cred-1', email: 'sentinel@private.example' },
        } as Job<AsyncEmailVerificationJobData, IEmailVerificationResponseDto>

        await expect(processor.process(job)).rejects.toBe(error)
        job.attemptsMade = 1
        await expect(processor.process(job)).rejects.toBe(error)
        await expect(processor.process(job)).rejects.toBe(error)

        expect(emailVerificationService.verify.mock.calls.map(([command]) => command.trace)).toEqual([
            { operationId: 'stable-job-id', mode: 'async', jobId: 'stable-job-id', attempt: 1 },
            { operationId: 'stable-job-id', mode: 'async', jobId: 'stable-job-id', attempt: 2 },
            { operationId: 'stable-job-id', mode: 'async', jobId: 'stable-job-id', attempt: 2 },
        ])
        expect(emailVerificationService.verify).toHaveBeenCalledTimes(3)
    })
})
