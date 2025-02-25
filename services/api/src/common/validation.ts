import 'zod-openapi/extend'
import { z, type ZodType } from 'zod'
import type { BulkProgressResponse, BulkStatusResponse } from './dto'
import { JobStatus } from './enums'

export const bulkRequestValidationSchema = z
    .object({
        id: z.string().uuid().nonempty(),
    })
    .strict()

export const bulkResponseValidationSchema = z
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

export const bulkStatusResponseValidationSchema = z.intersection(
    bulkProgressResponseValidationSchema,
    z
        .object({
            status: z.nativeEnum(JobStatus),
        })
        .strict(),
) satisfies ZodType<BulkStatusResponse>
