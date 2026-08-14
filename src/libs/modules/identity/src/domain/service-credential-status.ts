export const SERVICE_CREDENTIAL_STATUSES = ['active', 'disabled'] as const

export type ServiceCredentialStatus = (typeof SERVICE_CREDENTIAL_STATUSES)[number]
