export const RESOURCE = 'emails'
export const EMAIL_ROUTE = `/${RESOURCE}`
export const VERIFY_EMAIL_ROUTE = `${EMAIL_ROUTE}/verify`
export const VERIFY_EMAIL_BULK_ROUTE = `${VERIFY_EMAIL_ROUTE}/bulk`
export const VERIFY_EMAIL_BULK_RESULT_ROUTE = `${VERIFY_EMAIL_BULK_ROUTE}/:id`
export const VERIFY_EMAIL_BULK_STATUS_ROUTE = `${VERIFY_EMAIL_BULK_RESULT_ROUTE}/status`
export const VERIFY_EMAIL_ROUTE_LEGACY = 'verifyEmail'
