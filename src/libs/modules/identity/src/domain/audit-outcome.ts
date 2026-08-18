export const AUDIT_OUTCOMES = ['success', 'failure'] as const

export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number]
