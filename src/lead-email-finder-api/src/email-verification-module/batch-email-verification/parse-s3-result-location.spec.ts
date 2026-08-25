import { parseS3ResultLocation } from './parse-s3-result-location'

describe('parseS3ResultLocation', () => {
    it('returns the bucket and exact decoded object key without the URL separator', () => {
        expect(parseS3ResultLocation('s3://batch-results/organizations/org-1/results/result%20file.csv')).toEqual({
            bucket: 'batch-results',
            key: 'organizations/org-1/results/result file.csv',
        })
    })

    it.each([
        'https://batch-results/organizations/org-1/results/result.csv',
        's3:///organizations/org-1/results/result.csv',
        's3://batch-results',
        's3://batch-results/',
        's3://batch-results/result.csv?version=1',
        'not a URL',
    ])('rejects malformed result location %s', value => {
        expect(() => parseS3ResultLocation(value)).toThrow('Invalid S3 result location')
    })
})
