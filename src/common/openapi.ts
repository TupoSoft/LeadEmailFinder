import type { ZodOpenApiResponseObject } from 'zod-openapi'
import { z } from 'zod'

export interface ErrorResponseBodyParams {
    description: string
    example: string
}

export function errorResponseBodySchema({ example, description }: ErrorResponseBodyParams): ZodOpenApiResponseObject {
    return {
        description,
        content: {
            'application/json': {
                schema: z.object({
                    message: z.string().nonempty().openapi({ example }),
                }),
            },
        },
    }
}
