import type { ZodOpenApiOperationObject, ZodOpenApiPathsObject, ZodOpenApiResponseObject } from 'zod-openapi'
import { verifyEmailRequestBody, verifyEmailResponseBody } from './validation'
import { constants } from 'node:http2'
import { VERIFY_EMAIL_ROUTE } from './constants'

export const emailTag = {
    name: 'emails',
    description: 'Verifying emails',
}

const verifyEmailOkResponse: ZodOpenApiResponseObject = {
    description: 'Successfully verified email',
    content: {
        'application/json': {
            schema: verifyEmailResponseBody,
        },
    },
}

const verifyEmailPath: ZodOpenApiOperationObject = {
    tags: [emailTag.name],
    summary: 'Verify an email',
    requestBody: {
        content: {
            'application/json': {
                schema: verifyEmailRequestBody,
            },
        },
    },
    responses: {
        [constants.HTTP_STATUS_OK]: verifyEmailOkResponse,
    },
}

export const emailPaths: ZodOpenApiPathsObject = {
    [VERIFY_EMAIL_ROUTE]: {
        post: verifyEmailPath,
    },
}
