import { AuthRole } from '../../domain/auth-principal'
import { InvitationStatus } from '../../domain/invitation-status'

export const INVITATION_PREVIEW_READER = Symbol('INVITATION_PREVIEW_READER')

export interface InvitationPreviewRecord {
    readonly organizationName: string
    readonly email: string
    readonly role: AuthRole
    readonly expiresAt: Date
    readonly status: InvitationStatus
}

/** Reads only the display fields and authority state for one matching invitation. */
export interface InvitationPreviewReader {
    findByTokenHash(tokenHash: string): Promise<InvitationPreviewRecord | undefined>
}
