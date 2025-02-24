import 'zod-openapi/extend'
import { z } from 'zod'

export const bulkRequestParamsSchema = z
    .object({
        id: z.string().uuid().nonempty(),
    })
    .strict()

export const bulkOkResponseBodySchema = z
    .object({
        taskId: z.string().uuid().nonempty(),
        message: z.string().nonempty().openapi({ example: 'Request accepted.' }),
        monitorUrl: z.string().nonempty().url(),
    })
    .strict()
