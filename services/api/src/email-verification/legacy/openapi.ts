import type { ZodOpenApiOperationObject, ZodOpenApiResponseObject } from 'zod-openapi'
import { constants } from 'node:http2'
import { legacyVerifyEmailRequestQueryParams, legacyVerifyEmailResponseBody } from './validation'
import { VERIFY_EMAIL_ROUTE_LEGACY } from './constants'

export const verifyTag = {
    name: 'verify',
    description: 'Deprecated. Use /emails instead.',
}

const verifyEmailLegacyOkResponse: ZodOpenApiResponseObject = {
    description: 'Successfully verified email',
    content: {
        'application/json': {
            schema: legacyVerifyEmailResponseBody,
        },
    },
}

const verifyEmailOperation: ZodOpenApiOperationObject = {
    tags: [verifyTag.name],
    summary: 'Verify an email',
    requestParams: {
        query: legacyVerifyEmailRequestQueryParams,
    },
    responses: {
        [constants.HTTP_STATUS_OK]: verifyEmailLegacyOkResponse,
    },
}

export const legacyVerifyEmailPaths = {
    [VERIFY_EMAIL_ROUTE_LEGACY]: {
        get: verifyEmailOperation,
    },
}
