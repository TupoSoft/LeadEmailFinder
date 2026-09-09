import {
    AuthPrincipal,
    OrganizationDirectoryReader,
    OrganizationDirectoryRecord,
    OrganizationDirectorySeekKey,
} from '@tuposoft/lead-email-finder/modules/identity'
import { InsufficientPermissionError, InvalidOrganizationCursorError } from '../domain/organization-onboarding.errors'

export interface OrganizationListingResult {
    readonly organizations: readonly OrganizationDirectoryRecord[]
    readonly nextPageToken?: string
}

// Bound cursors to the four-digit years serialized by the API's date-time contract.
const MIN_CREATED_AT_MS = -62_135_596_800_000
const MAX_CREATED_AT_MS = 253_402_300_799_999
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export class OrganizationListingService {
    constructor(private readonly reader: OrganizationDirectoryReader) {}

    async list(actor: AuthPrincipal, pageSize: number, pageToken?: string): Promise<OrganizationListingResult> {
        const authorized = actor.credentialKind === 'service_client'
            ? actor.permissions.includes('platform:admin')
            : actor.membershipRole === 'platform_admin'
        if (!authorized) throw new InsufficientPermissionError('Platform administration permission is required')

        const before = pageToken === undefined ? undefined : this.decodeCursor(pageToken)
        const page = await this.reader.list({ limit: pageSize, ...(before ? { before } : {}) })
        const last = page.organizations.at(-1)
        return {
            organizations: page.organizations,
            ...(page.hasMore && last ? {
                nextPageToken: Buffer.from(JSON.stringify({
                    v: 1,
                    createdAtMilliseconds: last.createdAt.getTime(),
                    id: last.id,
                })).toString('base64url'),
            } : {}),
        }
    }

    private decodeCursor(token: string): OrganizationDirectorySeekKey {
        try {
            if (token.length > 512 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new InvalidOrganizationCursorError()
            const decoded = Buffer.from(token, 'base64url')
            if (decoded.toString('base64url') !== token) throw new InvalidOrganizationCursorError()
            const value: unknown = JSON.parse(decoded.toString('utf8'))
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                throw new InvalidOrganizationCursorError()
            }
            const cursor = value as Record<string, unknown>
            if (
                Object.keys(cursor).sort().join(',') !== 'createdAtMilliseconds,id,v'
                || cursor.v !== 1
                || typeof cursor.createdAtMilliseconds !== 'number'
                || !Number.isSafeInteger(cursor.createdAtMilliseconds)
                || cursor.createdAtMilliseconds < MIN_CREATED_AT_MS
                || cursor.createdAtMilliseconds > MAX_CREATED_AT_MS
                || typeof cursor.id !== 'string'
                || !UUID_PATTERN.test(cursor.id)
            ) {
                throw new InvalidOrganizationCursorError()
            }
            if (decoded.toString('utf8') !== JSON.stringify({
                v: 1, createdAtMilliseconds: cursor.createdAtMilliseconds, id: cursor.id,
            })) throw new InvalidOrganizationCursorError()
            return { createdAtMilliseconds: cursor.createdAtMilliseconds, id: cursor.id }
        } catch {
            throw new InvalidOrganizationCursorError()
        }
    }
}
