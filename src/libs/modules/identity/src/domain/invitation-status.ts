export const INVITATION_STATUSES = ['pending', 'accepted'] as const

export type InvitationStatus = (typeof INVITATION_STATUSES)[number]
