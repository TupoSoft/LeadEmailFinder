import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { AsyncEmailVerificationServiceImpl } from './async-email-verification-service-impl.service'
import { AsyncEmailVerificationJobNotFoundException } from './job-not-found.exception'

describe('AsyncEmailVerificationService', () => {
    let service: AsyncEmailVerificationServiceImpl
    let queue: { add: jest.Mock; getJob: jest.Mock }

    const principal = { organizationId: 'org-1', credentialId: 'cred-1' } as AuthPrincipal

    beforeEach(async () => {
        queue = { add: jest.fn(), getJob: jest.fn() }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AsyncEmailVerificationServiceImpl,
                {
                    provide: getQueueToken('async-email-verification'),
                    useValue: queue,
                },
            ],
        }).compile()

        service = module.get(AsyncEmailVerificationServiceImpl)
    })

    describe('verifyAsync', () => {
        // The processor reads job.data as VerifyOptions; enqueuing a bare string
        // leaves data.email undefined and fails the job at verification time.
        it('enqueues the email with the caller organization and credential ids', async () => {
            queue.add.mockResolvedValue({ id: 'job-1' })

            await expect(service.verifyAsync({ email: 'person@lef.test' }, principal)).resolves.toEqual({
                id: 'job-1',
            })

            expect(queue.add).toHaveBeenCalledWith(
                'async-email-verification',
                { email: 'person@lef.test', organizationId: 'org-1', credentialId: 'cred-1' },
                expect.objectContaining({ jobId: expect.any(String) }),
            )
        })

        it('throws when the queue returns a job without an id', async () => {
            const sentinel = 'unique-person@private.example'
            queue.add.mockResolvedValue({ id: undefined })

            const error = await service.verifyAsync({ email: sentinel }, principal).catch((caughtError: unknown) => {
                return caughtError
            })

            expect(error).toMatchObject({
                name: 'AssertionError',
                message: 'async_email_verification_job_id_missing',
            })
            expect((error as { message: string }).message).not.toContain(sentinel)
        })
    })

    describe('getAsyncVerificationState', () => {
        it('throws not-found when no job matches the id', async () => {
            queue.getJob.mockResolvedValue(undefined)

            await expect(service.getAsyncVerificationState('missing-id', principal)).rejects.toThrow(
                AsyncEmailVerificationJobNotFoundException,
            )
        })

        it('throws the same not-found error when the job belongs to a different organization', async () => {
            queue.getJob.mockResolvedValue({
                data: { email: 'person@lef.test', organizationId: 'other-org', credentialId: 'other-cred' },
                getState: jest.fn(),
            })

            await expect(service.getAsyncVerificationState('job-1', principal)).rejects.toThrow(
                AsyncEmailVerificationJobNotFoundException,
            )
        })

        it('returns the state for a job owned by the caller organization', async () => {
            queue.getJob.mockResolvedValue({
                data: { email: 'person@lef.test', organizationId: 'org-1', credentialId: 'cred-1' },
                getState: jest.fn().mockResolvedValue('waiting'),
            })

            await expect(service.getAsyncVerificationState('job-1', principal)).resolves.toEqual({
                state: 'waiting',
            })
        })

        it('rejects an unknown queue state without copying job data into the assertion', async () => {
            const sentinel = 'unique-person@private.example'
            queue.getJob.mockResolvedValue({
                data: { email: sentinel, organizationId: 'org-1', credentialId: 'cred-1' },
                getState: jest.fn().mockResolvedValue(`unexpected-${sentinel}`),
            })

            const error = await service
                .getAsyncVerificationState('job-1', principal)
                .catch((caughtError: unknown) => caughtError)

            expect(error).toMatchObject({
                name: 'AssertionError',
                message: 'async_email_verification_state_unknown',
            })
            expect((error as { message: string }).message).not.toContain(sentinel)
        })
    })
})
