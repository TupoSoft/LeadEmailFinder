import type { ZodOpenApiPathsObject } from 'zod-openapi'
import { EMAIL_ROUTE, EMAIL_ROUTE_WITH_PARAM } from './constants'
import { constants } from 'node:http2'
import {
    createEmailRequestValidationSchema,
    emailRecordValidationSchema,
    getEmailsQueryValidationSchema,
    getEmailsResponseValidationSchema,
    requestWithIdParamValidationSchema,
    updateEmailRequestValidationSchema,
} from './validation'

export const emailApiPaths: ZodOpenApiPathsObject = {
    [EMAIL_ROUTE]: {
        get: {
            tags: ['emails'],
            summary: 'Get all emails',
            requestParams: {
                query: getEmailsQueryValidationSchema,
            },
            responses: {
                [constants.HTTP_STATUS_OK]: {
                    description: 'Success',
                    content: {
                        'application/json': {
                            schema: getEmailsResponseValidationSchema,
                        },
                    },
                },
            },
        },
        post: {
            tags: ['emails'],
            summary: 'Adds an email record to the DB',
            requestBody: {
                content: {
                    'application/json': {
                        schema: createEmailRequestValidationSchema,
                    },
                },
            },
            responses: {
                [constants.HTTP_STATUS_CREATED]: {
                    description: 'Success',
                    content: {
                        'application/json': {
                            schema: emailRecordValidationSchema,
                        },
                    },
                },
            },
        },
    },
    [EMAIL_ROUTE_WITH_PARAM.replace(':email', '{email}')]: {
        get: {
            tags: ['emails'],
            summary: 'Get email',
            requestParams: {
                path: requestWithIdParamValidationSchema,
            },
            responses: {
                [constants.HTTP_STATUS_OK]: {
                    description: 'Success',
                    content: {
                        'application/json': {
                            schema: emailRecordValidationSchema,
                        },
                    },
                },
            },
        },
        patch: {
            tags: ['emails'],
            summary: 'Update email',
            requestParams: {
                path: requestWithIdParamValidationSchema,
            },
            requestBody: {
                content: {
                    'application/json': {
                        schema: updateEmailRequestValidationSchema,
                    },
                },
            },
            responses: {
                [constants.HTTP_STATUS_OK]: {
                    description: 'Success',
                    content: {
                        'application/json': {
                            schema: emailRecordValidationSchema,
                        },
                    },
                },
            },
        },
    },
}
