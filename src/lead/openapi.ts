import type { ZodOpenApiPathsObject } from 'zod-openapi'
import {
    FIND_LEAD_BULK_RESULT_ROUTE,
    FIND_LEAD_BULK_ROUTE,
    FIND_LEAD_BULK_STATUS_ROUTE,
    FIND_LEAD_ROUTE,
} from './constants'
import {
    findLeadBulkRequestBodySchema,
    findLeadBulkResultResponseBodySchema,
    findLeadBulkStatusResponseBodySchema,
    findLeadRequestBodySchema,
    findLeadResponseBodySchema,
} from './validation'
import { constants } from 'node:http2'
import { z } from 'zod'
import { bulkOkResponseBodySchema, bulkRequestParamsSchema } from '../common'

export const leadTag = {
    name: 'leads',
    description: 'Finding leads',
}

export const leadPaths: ZodOpenApiPathsObject = {
    [FIND_LEAD_ROUTE]: {
        post: {
            tags: [leadTag.name],
            summary: 'Find a lead',
            description: 'Find a lead given first name, last name and domain',
            requestBody: {
                content: {
                    'application/json': {
                        schema: findLeadRequestBodySchema,
                    },
                },
            },
            responses: {
                [constants.HTTP_STATUS_OK]: {
                    description: 'Successfully found',
                    content: {
                        'application/json': {
                            schema: findLeadResponseBodySchema,
                        },
                    },
                },
                [constants.HTTP_STATUS_BAD_REQUEST]: {
                    description: 'Validation error',
                    content: {
                        'application/json': {
                            schema: z.object({
                                message: z
                                    .string()
                                    .nonempty()
                                    .openapi({ example: 'The domain field should not be empty' }),
                            }),
                        },
                    },
                },
                [constants.HTTP_STATUS_UNAUTHORIZED]: {
                    description: 'Unauthorized',
                    content: {
                        'application/json': {
                            schema: z.object({
                                message: z.string().nonempty().openapi({ example: 'Unauthorized' }),
                            }),
                        },
                    },
                },
            },
        },
    },
    [FIND_LEAD_BULK_ROUTE]: {
        post: {
            tags: [leadTag.name],
            summary: 'Find multiple leads',
            description: 'Find multiple leads',
            requestBody: {
                content: {
                    'application/json': {
                        schema: findLeadBulkRequestBodySchema,
                    },
                },
            },
            responses: {
                [constants.HTTP_STATUS_ACCEPTED]: {
                    description: 'Request accepted',
                    content: {
                        'application/json': {
                            schema: bulkOkResponseBodySchema,
                        },
                    },
                },
                [constants.HTTP_STATUS_BAD_REQUEST]: {
                    description: 'Validation error',
                    content: {
                        'application/json': {
                            schema: z.object({
                                message: z
                                    .string()
                                    .nonempty()
                                    .openapi({ example: 'The domain field should not be empty' }),
                            }),
                        },
                    },
                },
                [constants.HTTP_STATUS_UNAUTHORIZED]: {
                    description: 'Unauthorized',
                    content: {
                        'application/json': {
                            schema: z.object({
                                message: z.string().nonempty().openapi({ example: 'Unauthorized' }),
                            }),
                        },
                    },
                },
            },
        },
    },
    [FIND_LEAD_BULK_STATUS_ROUTE.replace(':id', '{id}')]: {
        get: {
            tags: [leadTag.name],
            summary: 'Get the status of bulk lead search',
            description: 'Get the status of bulk lead search',
            requestParams: {
                path: bulkRequestParamsSchema,
            },
            responses: {
                [constants.HTTP_STATUS_OK]: {
                    description: 'Success',
                    content: {
                        'application/json': {
                            schema: findLeadBulkStatusResponseBodySchema,
                        },
                    },
                },
                [constants.HTTP_STATUS_NOT_FOUND]: {
                    description: 'ID not found',
                    content: {
                        'application/json': {
                            schema: z.object({
                                message: z.string().nonempty().openapi({ example: 'The job does not exist' }),
                            }),
                        },
                    },
                },
            },
        },
    },
    [FIND_LEAD_BULK_RESULT_ROUTE.replace(':id', '{id}')]: {
        get: {
            tags: [leadTag.name],
            summary: 'Get the result of bulk lead search',
            description: 'Get the result of bulk lead search',
            requestParams: {
                path: bulkRequestParamsSchema,
            },
            responses: {
                [constants.HTTP_STATUS_OK]: {
                    description: 'Success',
                    content: {
                        'application/json': {
                            schema: findLeadBulkResultResponseBodySchema,
                        },
                    },
                },
                [constants.HTTP_STATUS_NOT_FOUND]: {
                    description: 'ID not found',
                    content: {
                        'application/json': {
                            schema: z.object({
                                message: z.string().nonempty().openapi({ example: 'The job does not exist' }),
                            }),
                        },
                    },
                },
            },
        },
    },
}
