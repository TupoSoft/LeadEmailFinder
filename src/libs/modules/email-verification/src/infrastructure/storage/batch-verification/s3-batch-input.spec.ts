import { Readable } from 'node:stream'
import { ReadableStream } from 'node:stream/web'
import { Test, TestingModule } from '@nestjs/testing'
import { getS3ConnectionToken } from 'nestjs-s3'
import { S3BatchInput } from './s3-batch-input'
import { InvalidBatchCsvError } from '../../../application/delivery/batch/batch-terminal-failure'

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const items: T[] = []
    for await (const item of iterable) items.push(item)
    return items
}

describe('S3BatchInput', () => {
    let s3: { getObject: jest.Mock }
    let input: S3BatchInput

    beforeEach(async () => {
        s3 = { getObject: jest.fn() }

        const module: TestingModule = await Test.createTestingModule({
            providers: [S3BatchInput, { provide: getS3ConnectionToken('default'), useValue: s3 }],
        }).compile()

        input = module.get(S3BatchInput)
    })

    it('yields one row per valid CSV email', async () => {
        const csv = Readable.toWeb(Readable.from(['email\nperson@lef.test\nother@lef.test\n']))
        s3.getObject.mockResolvedValue({ Body: { transformToWebStream: () => csv } })

        const rows = await collect(input.rows('bucket', 'organizations/org-1/uploads/file.csv'))

        expect(rows).toEqual([{ email: 'person@lef.test' }, { email: 'other@lef.test' }])
    })

    it('rejects an invalid row without copying its address into the error', async () => {
        const sentinel = 'unique-person@private.example'
        const csv = Readable.toWeb(Readable.from([`email\n"${sentinel} extra"\n`]))
        s3.getObject.mockResolvedValue({ Body: { transformToWebStream: () => csv } })

        const error = await collect(input.rows('bucket', 'organizations/org-1/uploads/file.csv')).catch(
            (caughtError: unknown) => caughtError,
        )

        expect(error).toBeInstanceOf(InvalidBatchCsvError)
        expect((error as Error).message).toBe('batch_email_verification_csv_invalid')
        expect((error as Error).message).not.toContain(sentinel)
    })

    it.each([
        'email\n"private unfinished row',
        'email\nperson@lef.test,unexpected\n',
        'wrong_header\nperson@lef.test\n',
    ])('classifies parser and row failures without retaining CSV details %#', async content => {
        const csv = Readable.toWeb(Readable.from([content.slice(0, 9), content.slice(9)]))
        s3.getObject.mockResolvedValue({ Body: { transformToWebStream: () => csv } })

        const error: unknown = await collect(input.rows('bucket', 'key')).catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(InvalidBatchCsvError)
        expect(JSON.stringify(error)).not.toContain('private')
        expect((error as Error).message).toBe('batch_email_verification_csv_invalid')
    })

    it('preserves an object read failure as infrastructure failure', async () => {
        const error = new Error('storage unavailable')
        s3.getObject.mockRejectedValue(error)

        await expect(collect(input.rows('bucket', 'key'))).rejects.toBe(error)
    })

    it('preserves a streaming object failure instead of classifying it as invalid CSV', async () => {
        const error = new Error('storage interrupted')
        const source = new ReadableStream({ start: controller => controller.error(error) })
        s3.getObject.mockResolvedValue({ Body: { transformToWebStream: () => source } })

        await expect(collect(input.rows('bucket', 'key'))).rejects.toBe(error)
    })

    it('fetches the object fresh on every call, matching the two-pass validate/dispatch behavior', async () => {
        const csv = (): ReadableStream => Readable.toWeb(Readable.from(['email\nperson@lef.test\n']))
        s3.getObject.mockImplementation(() => Promise.resolve({ Body: { transformToWebStream: csv } }))

        await collect(input.rows('bucket', 'key'))
        await collect(input.rows('bucket', 'key'))

        expect(s3.getObject).toHaveBeenCalledTimes(2)
    })
})
