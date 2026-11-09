import { deriveResultsKey } from './derive-results-key'

describe('deriveResultsKey', () => {
    it('replaces the uploads segment with a results segment', () => {
        expect(deriveResultsKey('organizations/org-1/uploads/file.csv')).toBe('organizations/org-1/results/file.csv')
    })

    it('only replaces the first occurrence', () => {
        expect(deriveResultsKey('organizations/uploads/uploads/file.csv')).toBe(
            'organizations/results/uploads/file.csv',
        )
    })
})
