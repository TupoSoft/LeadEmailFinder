import type { ZodOpenApiPathsObject } from 'zod-openapi'
import { EMAIL_ROUTE } from './constants'
import { constants } from 'node:http2'
import { createEmailRequestValidationSchema, emailRecordValidationSchema } from './validation'

export const emailApiPaths: ZodOpenApiPathsObject = {
    [EMAIL_ROUTE]: {
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
}
