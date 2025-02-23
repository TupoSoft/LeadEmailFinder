import type { ZodOpenApiPathsObject } from 'zod-openapi'
import { EMAIL_ROUTE } from './constants'
import { constants } from 'node:http2'
import { createEmailRequestValidationSchema, emailRecordValidationSchema } from './validation'

export const emailApiPaths: ZodOpenApiPathsObject = {
    [EMAIL_ROUTE]: {
        post: {
            tags: ['emails'],
            requestBody: {
                content: {
                    'application/json': {
                        schema: createEmailRequestValidationSchema,
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
