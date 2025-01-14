import type { ZodOpenApiOperationObject, ZodOpenApiPathsObject, ZodOpenApiResponseObject } from 'zod-openapi'
import {
    verifyEmailBulkRequestBody,
    verifyEmailBulkResponseBody,
    verifyEmailRequestBody,
    verifyEmailResponseBody,
} from './validation'
import { constants } from 'node:http2'
import { VERIFY_EMAIL_BULK_ROUTE, VERIFY_EMAIL_BULK_STATUS_ROUTE, VERIFY_EMAIL_ROUTE } from './constants'
import { bulkOkResponseBodySchema, bulkRequestParamsSchema } from '../common'

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

const verifyEmailOperation: ZodOpenApiOperationObject = {
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

const verifyEmailBulkOkResponse: ZodOpenApiResponseObject = {
    description: 'Successfully verified emails',
    content: {
        'application/json': {
            schema: verifyEmailBulkResponseBody,
        },
    },
}

const verifyEmailBulkOperation: ZodOpenApiOperationObject = {
    tags: [emailTag.name],
    summary: 'Verify multiple emails',
    requestBody: {
        content: {
            'application/json': {
                schema: verifyEmailBulkRequestBody,
            },
        },
    },
    responses: {
        [constants.HTTP_STATUS_OK]: verifyEmailBulkOkResponse,
    },
}

const verifyEmailBulkStatusOkResponse: ZodOpenApiResponseObject = {
    description: 'Success',
    content: {
        'application/json': {
            schema: bulkOkResponseBodySchema,
        },
    },
}

const verifyEmailBulkStatusOperation: ZodOpenApiOperationObject = {
    tags: [emailTag.name],
    summary: 'Get the status of bulk email verification',
    requestParams: {
        path: bulkRequestParamsSchema,
    },
    responses: {
        [constants.HTTP_STATUS_OK]: verifyEmailBulkStatusOkResponse,
    },
}

export const emailPaths: ZodOpenApiPathsObject = {
    [VERIFY_EMAIL_ROUTE]: {
        post: verifyEmailOperation,
    },
    [VERIFY_EMAIL_BULK_ROUTE]: {
        post: verifyEmailBulkOperation,
    },
    [VERIFY_EMAIL_BULK_STATUS_ROUTE.replace(':id', '{id}')]: {
        get: verifyEmailBulkStatusOperation,
    },
}
