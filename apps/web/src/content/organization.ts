import type { components } from '@tuposoft/lead-email-finder-api-client'

export const organizationRoleLabels = {
    owner: 'Owner',
    admin: 'Administrator',
    member: 'Member',
} as const satisfies Record<components['schemas']['IssueInvitationDto']['role'], string>
