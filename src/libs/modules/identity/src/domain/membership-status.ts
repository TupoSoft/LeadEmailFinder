export const MEMBERSHIP_STATUSES = ['active', 'disabled'] as const

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]
