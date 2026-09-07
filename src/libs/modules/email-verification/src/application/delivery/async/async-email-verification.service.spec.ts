import { IEmailVerificationResponseDto, JobState } from '@tuposoft/lead-email-finder/common'
import { VerificationTraceObserver } from '../../verification-trace/verification-trace-observer'
import { AsyncEmailVerificationService } from './async-email-verification.service'
import { AsyncVerificationJobs } from './async-verification-jobs'
import { AsyncEmailVerificationJobNotFoundException } from './job-not-found.exception'

describe('AsyncEmailVerificationService', () => {
    let traceObserver: jest.Mocked<VerificationTraceObserver>
    let service: AsyncEmailVerificationService
    let jobs: jest.Mocked<AsyncVerificationJobs>

    const command = { email: 'person@lef.test', organizationId: 'org-1', credentialId: 'cred-1' }
    const result = { id: 'verification-id', email: command.email } as IEmailVerificationResponseDto

    beforeEach(() => {
        traceObserver = {
            enqueued: jest.fn(),
            completed: jest.fn(),
            failed: jest.fn(),
            batchCompleted: jest.fn(),
        }
        jobs = { enqueue: jest.fn(), find: jest.fn() }
        service = new AsyncEmailVerificationService(jobs, traceObserver)
    })

    it('enqueues the unchanged email and scalar identity with a generated UUID', async () => {
        jobs.enqueue.mockResolvedValue({ id: 'returned-job-id' })

        await expect(service.verifyAsync({ ...command, email: 'PERSON@LEF.TEST' })).resolves.toEqual({
            id: 'returned-job-id',
        })

        expect(jobs.enqueue).toHaveBeenCalledTimes(1)
        expect(jobs.enqueue).toHaveBeenCalledWith(
            { ...command, email: 'PERSON@LEF.TEST' },
            expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
        )
        expect(jobs.find).not.toHaveBeenCalled()
    })

    it('throws a stable error when the queue returns no job ID', async () => {
        jobs.enqueue.mockResolvedValue({ id: undefined })

        await expect(service.verifyAsync(command)).rejects.toMatchObject({
            name: 'AssertionError',
            message: 'async_email_verification_job_id_missing',
        })
        expect(traceObserver.enqueued).not.toHaveBeenCalled()
        expect(traceObserver.failed).toHaveBeenCalledTimes(1)
    })

    it('links the request to the returned job without adding request data to the queue', async () => {
        jobs.enqueue.mockResolvedValue({ id: 'returned-job-id' })

        await service.verifyAsync({ ...command, requestId: 'server-request-id' })

        expect(traceObserver.enqueued).toHaveBeenCalledWith({
            requestId: 'server-request-id',
            mode: 'async',
            jobId: 'returned-job-id',
        })
        expect(jobs.enqueue.mock.calls[0][0]).toEqual(command)
    })

    it('generates an independent request UUID when the HTTP adapter supplies none', async () => {
        jobs.enqueue.mockResolvedValue({ id: 'returned-job-id' })

        await service.verifyAsync(command)

        expect(traceObserver.enqueued).toHaveBeenCalledWith({
            requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
            mode: 'async',
            jobId: 'returned-job-id',
        })
        expect(traceObserver.enqueued.mock.calls[0][0].requestId).not.toBe(jobs.enqueue.mock.calls[0][1])
    })

    it('preserves successful queue submission when its observer throws', async () => {
        jobs.enqueue.mockResolvedValue({ id: 'job-1' })
        traceObserver.enqueued.mockImplementation(() => {
            throw new Error('observer unavailable')
        })

        await expect(service.verifyAsync(command)).resolves.toEqual({ id: 'job-1' })
        expect(jobs.enqueue).toHaveBeenCalledTimes(1)
        expect(traceObserver.failed).not.toHaveBeenCalled()
    })

    it('emits safe dispatch failure fields and rethrows the same error despite observer failure', async () => {
        const error = new Error('sentinel@private.example queue diagnostics')
        jobs.enqueue.mockRejectedValue(error)
        traceObserver.failed.mockImplementation(() => {
            throw new Error('observer unavailable')
        })

        await expect(service.verifyAsync({ ...command, requestId: 'request-id' })).rejects.toBe(error)
        expect(traceObserver.enqueued).not.toHaveBeenCalled()
        expect(traceObserver.failed).toHaveBeenCalledWith({
            operationId: 'request-id',
            mode: 'async',
            jobId: jobs.enqueue.mock.calls[0][1],
            stage: 'queue_dispatch',
            errorType: 'Error',
            durationMs: expect.any(Number),
        })
        expect(JSON.stringify(traceObserver.failed.mock.calls)).not.toContain('sentinel')
    })

    it('throws not-found when no job matches the ID', async () => {
        jobs.find.mockResolvedValue(undefined)

        await expect(service.getAsyncVerificationState('missing-id', command.organizationId)).rejects.toEqual(
            new AsyncEmailVerificationJobNotFoundException('missing-id'),
        )
    })

    it('conceals a foreign job before reading its status', async () => {
        const readStatus = jest.fn()
        jobs.find.mockResolvedValue({ organizationId: 'other-org', readStatus })

        await expect(service.getAsyncVerificationState('job-id', command.organizationId)).rejects.toEqual(
            new AsyncEmailVerificationJobNotFoundException('job-id'),
        )
        expect(readStatus).not.toHaveBeenCalled()
    })

    it.each(Object.values(JobState).filter(state => state !== JobState.COMPLETED))(
        'returns only the state for an owned %s job',
        async state => {
            jobs.find.mockResolvedValue({
                organizationId: command.organizationId,
                readStatus: jest.fn().mockResolvedValue({ state, result }),
            })

            await expect(service.getAsyncVerificationState('job-id', command.organizationId)).resolves.toEqual({
                state,
            })
            expect(jobs.find).toHaveBeenCalledWith('job-id')
            expect(jobs.enqueue).not.toHaveBeenCalled()
        },
    )

    it('returns the unchanged completed result on repeated status reads without enqueuing', async () => {
        const readStatus = jest.fn().mockResolvedValue({ state: 'completed', result })
        jobs.find.mockResolvedValue({ organizationId: command.organizationId, readStatus })

        for (let attempt = 0; attempt < 2; attempt++) {
            await expect(service.getAsyncVerificationState('job-id', command.organizationId)).resolves.toEqual({
                state: 'completed',
                result,
            })
        }

        expect(readStatus).toHaveBeenCalledTimes(2)
        expect(jobs.enqueue).not.toHaveBeenCalled()
        expect(traceObserver.enqueued).not.toHaveBeenCalled()
    })

    it('rejects an unsupported state without copying it into the assertion', async () => {
        jobs.find.mockResolvedValue({
            organizationId: command.organizationId,
            readStatus: jest.fn().mockResolvedValue({ state: 'unexpected-sentinel@private.example' }),
        })

        await expect(service.getAsyncVerificationState('job-id', command.organizationId)).rejects.toMatchObject({
            name: 'AssertionError',
            message: 'async_email_verification_state_unknown',
        })
    })

    it.each(['find', 'readStatus'])('preserves a %s adapter failure', async operation => {
        const error = new Error('queue unavailable')
        if (operation === 'find') {
            jobs.find.mockRejectedValue(error)
        } else {
            jobs.find.mockResolvedValue({
                organizationId: command.organizationId,
                readStatus: jest.fn().mockRejectedValue(error),
            })
        }

        await expect(service.getAsyncVerificationState('job-id', command.organizationId)).rejects.toBe(error)
        expect(jobs.enqueue).not.toHaveBeenCalled()
    })
})
