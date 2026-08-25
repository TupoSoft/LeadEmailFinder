import { Upload } from '@aws-sdk/lib-storage'
import { PassThrough } from 'node:stream'
import { S3 } from 'nestjs-s3'
import { S3BatchResultUploader } from './s3-batch-result-uploader.service'

jest.mock('@aws-sdk/lib-storage')

const mockedUpload = Upload as jest.MockedClass<typeof Upload>

describe('S3BatchResultUploader', () => {
    it('starts a CSV upload with the configured S3 client and exact object key', () => {
        const s3 = {} as S3
        const upload = {} as Upload
        const body = new PassThrough()
        mockedUpload.mockImplementationOnce(() => upload)

        const uploader = new S3BatchResultUploader(s3)

        expect(
            uploader.startCsvUpload({
                bucket: 'batch-results',
                key: 'organizations/org-1/results/input.csv',
                body,
            }),
        ).toBe(upload)
        expect(mockedUpload).toHaveBeenCalledWith({
            client: s3,
            params: {
                Bucket: 'batch-results',
                Key: 'organizations/org-1/results/input.csv',
                Body: body,
                ContentType: 'text/csv',
            },
        })
    })
})
