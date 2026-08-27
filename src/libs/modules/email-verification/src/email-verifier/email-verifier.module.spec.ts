import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import { catchAllVerifiersForProxy } from './email-verifier.module'

describe('catchAllVerifiersForProxy', () => {
    const verifiers = [{ sourceName: 'microsoft_1', verify: jest.fn() }] satisfies ICatchAllVerifier[]

    it('disables catch-all HTTP verification when no proxy is configured', () => {
        expect(catchAllVerifiersForProxy(undefined, verifiers)).toEqual([])
    })

    it('enables catch-all HTTP verification when a proxy is configured', () => {
        expect(catchAllVerifiersForProxy('http://proxy.example:8080', verifiers)).toEqual(verifiers)
    })
})
