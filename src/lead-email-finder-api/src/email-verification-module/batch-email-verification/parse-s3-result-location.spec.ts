import { parseS3ResultLocation } from './parse-s3-result-location'

describe('parseS3ResultLocation', () => {
    it('parses a valid s3 URL into a bucket and a key with no leading slash', () => {
        expect(parseS3ResultLocation('s3://bucket/organizations/org-1/results/result.csv')).toEqual({
            bucket: 'bucket',
            key: 'organizations/org-1/results/result.csv',
        })
    })

    it('decodes percent-encoded characters in the key', () => {
        expect(parseS3ResultLocation('s3://bucket/organizations/org%201/results/result.csv')).toEqual({
            bucket: 'bucket',
            key: 'organizations/org 1/results/result.csv',
        })
    })

    it('throws for a non-s3 protocol', () => {
        expect(() => parseS3ResultLocation('https://bucket/key')).toThrow()
    })

    it('throws for an empty bucket', () => {
        expect(() => parseS3ResultLocation('s3:///key')).toThrow()
    })

    it.each(['s3://bucket', 's3://bucket/'])('throws for an empty key (%s)', value => {
        expect(() => parseS3ResultLocation(value)).toThrow()
    })

    it.each(['not a url', ''])('throws for a completely malformed value (%p)', value => {
        expect(() => parseS3ResultLocation(value)).toThrow()
    })
})
