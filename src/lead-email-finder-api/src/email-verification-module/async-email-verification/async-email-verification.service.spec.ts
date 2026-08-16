import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { AsyncEmailVerificationServiceImpl } from './async-email-verification-service-impl.service'

describe('AsyncEmailVerificationService', () => {
    let service: AsyncEmailVerificationServiceImpl
    let queue: { add: jest.Mock; getJob: jest.Mock }

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
        it('enqueues the email as a VerifyOptions object', async () => {
            queue.add.mockResolvedValue({ id: 'job-1' })

            await expect(service.verifyAsync({ email: 'person@lef.test' })).resolves.toEqual({ id: 'job-1' })

            expect(queue.add).toHaveBeenCalledWith(
                'async-email-verification',
                { email: 'person@lef.test' },
                expect.objectContaining({ jobId: expect.any(String) }),
            )
        })

        it('throws when the queue returns a job without an id', async () => {
            queue.add.mockResolvedValue({ id: undefined })

            await expect(service.verifyAsync({ email: 'person@lef.test' })).rejects.toThrow(
                /Failed to add job to queue/,
            )
        })
    })
})
