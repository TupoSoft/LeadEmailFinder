export const RESOURCE = 'emails'
export const EMAIL_ROUTE = `/${RESOURCE}`
export const VERIFY_EMAIL_ROUTE = `${EMAIL_ROUTE}/verify`
export const VERIFY_EMAIL_BULK_ROUTE = `${VERIFY_EMAIL_ROUTE}/bulk`
export const VERIFY_EMAIL_BULK_RESULT_ROUTE = `${VERIFY_EMAIL_BULK_ROUTE}/:id`
export const VERIFY_EMAIL_BULK_STATUS_ROUTE = `${VERIFY_EMAIL_BULK_RESULT_ROUTE}/status`
export const VERIFY_EMAIL_ROUTE_OLD = '/verify'

export const EMAIL_VERIFICATION_SOURCES = [
    'mx',
    'microsoft_4',
    'microsoft_1',
    'mimecast',
    'microsoft_2',
    'linkedin',
] as const
