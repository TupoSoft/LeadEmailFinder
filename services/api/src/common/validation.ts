import 'zod-openapi/extend'
import { z, type ZodType } from 'zod'
import type { BulkProgressResponse } from './dto'

export const bulkRequestParamsSchema = z.object({
    id: z.string().nonempty().openapi({ example: '1' }),
})

export const bulkOkResponseBodySchema = z
    .object({
        taskId: z.string().uuid().nonempty(),
        message: z.string().nonempty().openapi({ example: 'Request accepted.' }),
        monitorUrl: z.string().nonempty().url(),
    })
    .strict()

export const bulkProgressResponseValidationSchema = z
    .object({
        total: z.number(),
        processed: z.number(),
    })
    .strict() satisfies ZodType<BulkProgressResponse>
