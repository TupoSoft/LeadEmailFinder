import type { ZodOpenApiOperationObject, ZodOpenApiPathsObject, ZodOpenApiResponseObject } from 'zod-openapi'
import {
    legacyVerifyEmailRequestQueryParams,
    verifyEmailBulkRequestBody,
    verifyEmailBulkResultResponseBody,
    verifyEmailOldResponseSchema,
    verifyEmailRequestBody,
    verifyEmailResponseSchema,
} from './validation'
import { constants } from 'node:http2'
import {
    VERIFY_EMAIL_BULK_RESULT_ROUTE,
    VERIFY_EMAIL_BULK_ROUTE,
    VERIFY_EMAIL_BULK_STATUS_ROUTE,
    VERIFY_EMAIL_ROUTE,
    VERIFY_EMAIL_ROUTE_OLD,
} from './constants'
import {
    bulkRequestValidationSchema,
    bulkResponseValidationSchema,
    bulkStatusResponseValidationSchema,
    errorResponseBodySchema,
} from '../common'

export const verificationTag = {
    name: 'verifications',
    description: 'Verifying emails',
}

const verifyEmailOkResponse: ZodOpenApiResponseObject = {
    description: 'Successfully verified email',
    content: {
        'application/json': {
            schema: verifyEmailResponseSchema,
        },
    },
}

const verifyEmailOperation: ZodOpenApiOperationObject = {
    tags: [verificationTag.name],
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
        [constants.HTTP_STATUS_BAD_REQUEST]: errorResponseBodySchema({
            example: 'email must be a string',
            description: 'Validation failed',
        }),
        [constants.HTTP_STATUS_UNAUTHORIZED]: errorResponseBodySchema({
            example: 'Unauthorized',
            description: 'Unauthorized',
        }),
        [constants.HTTP_STATUS_UNAVAILABLE_FOR_LEGAL_REASONS]: errorResponseBodySchema({
            example: 'The domain example.com verification is forbidden',
            description:
                'The requested operation is not permitted because the domain owner has restricted access or filed a complaint.',
        }),
    },
}

const verifyEmailBulkOkResponse: ZodOpenApiResponseObject = {
    description: 'Successfully verified emails',
    content: {
        'application/json': {
            schema: bulkResponseValidationSchema,
        },
    },
}

const verifyEmailBulkOperation: ZodOpenApiOperationObject = {
    tags: [verificationTag.name],
    summary: 'Verify multiple emails',
    requestBody: {
        content: {
            'application/json': {
                schema: verifyEmailBulkRequestBody,
            },
        },
    },
    responses: {
        [constants.HTTP_STATUS_ACCEPTED]: verifyEmailBulkOkResponse,
        [constants.HTTP_STATUS_BAD_REQUEST]: errorResponseBodySchema({
            example: 'Must be a non-empty array of emails',
            description: 'Validation failed',
        }),
        [constants.HTTP_STATUS_UNAUTHORIZED]: errorResponseBodySchema({
            example: 'Unauthorized',
            description: 'Unauthorized',
        }),
    },
}

const verifyEmailBulkStatusOkResponse: ZodOpenApiResponseObject = {
    description: 'Success',
    content: {
        'application/json': {
            schema: bulkStatusResponseValidationSchema,
        },
    },
}

const verifyEmailBulkStatusOperation: ZodOpenApiOperationObject = {
    tags: [verificationTag.name],
    summary: 'Get the status of bulk email verification',
    requestParams: {
        path: bulkRequestValidationSchema,
    },
    responses: {
        [constants.HTTP_STATUS_OK]: verifyEmailBulkStatusOkResponse,
    },
}

const verifyEmailBulkResultOkResponse: ZodOpenApiResponseObject = {
    description: 'Success',
    content: {
        'application/json': {
            schema: verifyEmailBulkResultResponseBody,
        },
    },
}

const verifyEmailBulkResultOperation: ZodOpenApiOperationObject = {
    tags: [verificationTag.name],
    summary: 'Get the result of bulk email verification',
    requestParams: {
        path: bulkRequestValidationSchema,
    },
    responses: {
        [constants.HTTP_STATUS_OK]: verifyEmailBulkResultOkResponse,
    },
}

const verifyEmailLegacyOkResponse: ZodOpenApiResponseObject = {
    description: 'Successfully verified email',
    content: {
        'application/json': {
            schema: verifyEmailOldResponseSchema,
        },
    },
}

const verifyOperation: ZodOpenApiOperationObject = {
    tags: [verificationTag.name],
    summary: 'Verify an email. Deprecated.',
    deprecated: true,
    requestParams: {
        query: legacyVerifyEmailRequestQueryParams,
    },
    responses: {
        [constants.HTTP_STATUS_OK]: verifyEmailLegacyOkResponse,
        [constants.HTTP_STATUS_BAD_REQUEST]: errorResponseBodySchema({
            example: 'Invalid email address',
            description: 'Validation failed',
        }),
        [constants.HTTP_STATUS_UNAUTHORIZED]: errorResponseBodySchema({
            example: 'Unauthorized',
            description: 'Unauthorized',
        }),
        [constants.HTTP_STATUS_UNAVAILABLE_FOR_LEGAL_REASONS]: errorResponseBodySchema({
            example: 'The domain example.com verification is forbidden',
            description:
                'The requested operation is not permitted because the domain owner has restricted access or filed a complaint.',
        }),
    },
}

export const emailVerificationPaths: ZodOpenApiPathsObject = {
    [VERIFY_EMAIL_ROUTE_OLD]: {
        get: verifyOperation,
    },
    [VERIFY_EMAIL_ROUTE]: {
        post: verifyEmailOperation,
    },
    [VERIFY_EMAIL_BULK_ROUTE]: {
        post: verifyEmailBulkOperation,
    },
    [VERIFY_EMAIL_BULK_STATUS_ROUTE.replace(':id', '{id}')]: {
        get: verifyEmailBulkStatusOperation,
    },
    [VERIFY_EMAIL_BULK_RESULT_ROUTE.replace(':id', '{id}')]: {
        get: verifyEmailBulkResultOperation,
    },
}
