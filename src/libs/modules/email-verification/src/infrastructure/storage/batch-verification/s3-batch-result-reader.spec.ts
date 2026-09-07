import { Test, TestingModule } from '@nestjs/testing'
import { getS3ConnectionToken } from 'nestjs-s3'
import { S3BatchResultReader } from './s3-batch-result-reader'

describe('S3BatchResultReader', () => {
    let s3: { getObject: jest.Mock }
    let reader: S3BatchResultReader

    beforeEach(async () => {
        s3 = { getObject: jest.fn() }

        const module: TestingModule = await Test.createTestingModule({
            providers: [S3BatchResultReader, { provide: getS3ConnectionToken('default'), useValue: s3 }],
        }).compile()

        reader = module.get(S3BatchResultReader)
    })

    it('streams the object at the parsed bucket/key', async () => {
        const webStream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('email\n'))
                controller.close()
            },
        })
        s3.getObject.mockResolvedValueOnce({ Body: { transformToWebStream: () => webStream } })

        const readable = await reader.read('s3://bucket/organizations/org-1/results/result.csv')

        expect(readable).toBeDefined()
        expect(s3.getObject).toHaveBeenCalledWith({
            Bucket: 'bucket',
            Key: 'organizations/org-1/results/result.csv',
        })
    })

    it.each(['not-a-valid-s3-url', ''])(
        'rejects and never calls S3 for a malformed result location (%p)',
        async result => {
            await expect(reader.read(result)).rejects.toThrow()
            expect(s3.getObject).not.toHaveBeenCalled()
        },
    )
})
