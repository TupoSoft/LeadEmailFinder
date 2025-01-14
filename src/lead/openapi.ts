import type { ZodOpenApiPathsObject } from 'zod-openapi'
import { FIND_LEAD_ROUTE } from './constants'
import { findLeadRequestBodySchema, findLeadResponseBodySchema } from './validation'

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
                '200': {
                    description: 'Successfully found',
                    content: {
                        'application/json': {
                            schema: findLeadResponseBodySchema,
                        },
                    },
                },
            },
        },
    },
}
