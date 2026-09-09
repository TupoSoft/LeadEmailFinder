import { AuthPrincipal, OrganizationDirectoryReader } from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientPermissionError, InvalidOrganizationCursorError } from '../domain/organization-onboarding.errors'
import { OrganizationListingService } from './organization-listing.service'

const actor: AuthPrincipal = {
    credentialKind: 'human_session', issuer: 'https://issuer', subject: 'operator',
    organizationId: 'organization', membershipRole: 'platform_admin', permissions: [], credentialId: 'identity',
}
const record = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Directory test',
    createdAt: new Date('2026-09-09T12:34:56.789Z'), updatedAt: new Date('2026-09-09T12:34:56.790Z'),
}
const cursor = { v: 1, createdAtMilliseconds: record.createdAt.getTime(), id: record.id }
const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')

describe('OrganizationListingService', () => {
    let reader: jest.Mocked<OrganizationDirectoryReader>
    let service: OrganizationListingService

    beforeEach(() => {
        reader = { findById: jest.fn(), list: jest.fn().mockResolvedValue({ organizations: [record], hasMore: false }) }
        service = new OrganizationListingService(reader)
    })

    it.each(['member', 'admin', 'owner'] as const)('rejects %s before reading data or parsing a cursor', async membershipRole => {
        await expect(service.list({ ...actor, membershipRole }, 50, 'invalid')).rejects.toThrow(InsufficientPermissionError)
        expect(reader.list).not.toHaveBeenCalled()
    })

    it('does not infer platform permission from a service client membership role', async () => {
        await expect(service.list({ ...actor, credentialKind: 'service_client' }, 50)).rejects.toThrow(InsufficientPermissionError)
        expect(reader.list).not.toHaveBeenCalled()
    })

    it('passes only the typed limit for the first page and omits any terminal cursor', async () => {
        await expect(service.list(actor, 50)).resolves.toEqual({ organizations: [record] })
        expect(reader.list).toHaveBeenCalledWith({ limit: 50 })
    })

    it('preserves an empty directory without a cursor or total', async () => {
        reader.list.mockResolvedValue({ organizations: [], hasMore: false })
        await expect(service.list(actor, 50)).resolves.toEqual({ organizations: [] })
    })

    it('encodes the final visible row, then decodes its exact millisecond and UUID seek key', async () => {
        reader.list.mockResolvedValue({ organizations: [{ ...record, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, record], hasMore: true })
        const first = await service.list(actor, 2)
        expect(first.nextPageToken).toBe(encode(cursor))
        await service.list(actor, 2, first.nextPageToken)
        expect(reader.list).toHaveBeenLastCalledWith({ limit: 2, before: { createdAtMilliseconds: record.createdAt.getTime(), id: record.id } })
    })

    it.each([
        '', 'not+base64', 'not/base64', 'a', encode(cursor) + '=', encode(cursor) + '\n', 'a'.repeat(513),
        Buffer.from('invalid JSON').toString('base64url'), encode(null), encode([]), encode(1), encode('cursor'),
        encode({ ...cursor, v: 2 }), encode({ ...cursor, v: '1' }), encode({ ...cursor, v: undefined }),
        encode({ ...cursor, createdAtMilliseconds: '1234' }), encode({ ...cursor, createdAtMilliseconds: null }),
        encode({ ...cursor, createdAtMilliseconds: true }), encode({ ...cursor, createdAtMilliseconds: 1.5 }),
        encode({ ...cursor, createdAtMilliseconds: 253_402_300_800_000 }),
        encode({ ...cursor, createdAtMilliseconds: -62_135_596_800_001 }),
        encode({ ...cursor, id: 1 }), encode({ ...cursor, id: null }), encode({ ...cursor, id: 'not-a-uuid' }),
        encode({ ...cursor, id: record.id.toUpperCase() }), encode({ ...cursor, extra: true }),
        encode({ id: cursor.id, v: 1, createdAtMilliseconds: cursor.createdAtMilliseconds }),
        Buffer.from(JSON.stringify(cursor, null, 2)).toString('base64url'),
        Buffer.from(JSON.stringify(cursor).replace('"v":1', '"v":2,"v":1')).toString('base64url'),
    ])('rejects malformed, unsupported, noncanonical, or out-of-range cursor case %#', async token => {
        await expect(service.list(actor, 50, token)).rejects.toThrow(InvalidOrganizationCursorError)
        expect(reader.list).not.toHaveBeenCalled()
    })

    it.each([-62_135_596_800_000, 253_402_300_799_999])('accepts the supported date boundary %s', async createdAtMilliseconds => {
        await service.list(actor, 1, encode({ ...cursor, createdAtMilliseconds }))
        expect(reader.list).toHaveBeenCalledWith({ limit: 1, before: { createdAtMilliseconds, id: record.id } })
    })
})
