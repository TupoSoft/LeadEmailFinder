import { Queue } from 'bullmq'
import { EmailVerificationReason, IEmailVerificationResponseDto } from '@tuposoft/lead-email-finder/common'
import { AsyncEmailVerificationJobData } from './async-email-verification-job-data.interface'
import { BullAsyncVerificationJobs } from './bull-async-verification-jobs'

describe('BullAsyncVerificationJobs', () => {
    const result: IEmailVerificationResponseDto = {
        id: '6b263662-0f5d-4013-a705-7432665a291e',
        email: 'person@example.test',
        domain: 'example.test',
        localPart: 'person',
        sources: [],
        exists: true,
        catchAll: false,
        reason: EmailVerificationReason.AcceptedEmail,
        createdAt: new Date('2026-09-07T00:00:00.000Z'),
    }

    function setup(): {
        jobs: BullAsyncVerificationJobs
        add: jest.Mock
        getJob: jest.Mock
    } {
        const add = jest.fn()
        const getJob = jest.fn()
        const queue = { add, getJob } as unknown as Queue<
            AsyncEmailVerificationJobData,
            IEmailVerificationResponseDto,
            'async-email-verification'
        >
        return { jobs: new BullAsyncVerificationJobs(queue), add, getJob }
    }

    it('enqueues only the existing serialized fields with the caller-supplied stable ID', async () => {
        const { jobs, add } = setup()
        add.mockResolvedValue({ id: 'stable-job-id' })
        const data = {
            email: 'person@example.test',
            organizationId: 'org-1',
            credentialId: 'credential-1',
            requestId: 'not-serialized',
        }

        await expect(jobs.enqueue(data, 'stable-job-id')).resolves.toEqual({ id: 'stable-job-id' })
        expect(add).toHaveBeenCalledTimes(1)
        expect(add).toHaveBeenCalledWith(
            'async-email-verification',
            { email: 'person@example.test', organizationId: 'org-1', credentialId: 'credential-1' },
            { jobId: 'stable-job-id' },
        )
    })

    it('preserves a missing returned ID for the application assertion', async () => {
        const { jobs, add } = setup()
        add.mockResolvedValue({})
        await expect(
            jobs.enqueue({ email: 'person@example.test', organizationId: 'org-1', credentialId: 'credential-1' }, 'id'),
        ).resolves.toEqual({ id: undefined })
    })

    it('returns no record for a missing queue job', async () => {
        const { jobs, getJob } = setup()
        getJob.mockResolvedValue(undefined)
        await expect(jobs.find('missing')).resolves.toBeUndefined()
        expect(getJob).toHaveBeenCalledTimes(1)
        expect(getJob).toHaveBeenCalledWith('missing')
    })

    it.each(['active', 'delayed', 'failed', 'waiting', 'waiting-children', 'unknown'])(
        'defers state access until the application authorizes the lookup and omits results for %s',
        async state => {
            const { jobs, getJob } = setup()
            const getState = jest.fn().mockResolvedValue(state)
            const readResult = jest.fn(() => result)
            getJob.mockResolvedValue({
                data: { organizationId: 'org-1', email: 'person@example.test', credentialId: 'credential-1' },
                getState,
                get returnvalue() {
                    return readResult()
                },
            })

            const job = await jobs.find('job-id')
            expect(job?.organizationId).toBe('org-1')
            expect(getState).not.toHaveBeenCalled()
            expect(readResult).not.toHaveBeenCalled()
            await expect(job!.readStatus()).resolves.toEqual({ state })
            expect(getState).toHaveBeenCalledTimes(1)
            expect(readResult).not.toHaveBeenCalled()
        },
    )

    it('reads the original result only after resolving completed state', async () => {
        const { jobs, getJob } = setup()
        const getState = jest.fn().mockResolvedValue('completed')
        const readResult = jest.fn(() => result)
        getJob.mockResolvedValue({
            data: { organizationId: 'org-1' },
            getState,
            get returnvalue() {
                return readResult()
            },
        })

        const job = await jobs.find('job-id')
        expect(readResult).not.toHaveBeenCalled()
        await expect(job!.readStatus()).resolves.toEqual({ state: 'completed', result })
        expect(readResult).toHaveBeenCalledTimes(1)
        expect(getState.mock.invocationCallOrder[0]).toBeLessThan(readResult.mock.invocationCallOrder[0])
    })

    it('propagates queue lookup failures unchanged', async () => {
        const { jobs, getJob } = setup()
        const error = new Error('queue_lookup_failed')
        getJob.mockRejectedValue(error)
        await expect(jobs.find('job-id')).rejects.toBe(error)
    })
})
