import 'zod-openapi/extend'
import { z } from 'zod'
import { VERIFY_EMAIL_BULK_STATUS_ROUTE } from '../email-verification/constants'

export const bulkRequestParamsSchema = z.object({
    id: z.string().nonempty().openapi({ example: '1' }),
})

export const bulkOkResponseBodySchema = z.object({
    taskId: z.string().nonempty().openapi({ example: '1' }),
    message: z.string().nonempty().openapi({ example: 'Request accepted.' }),
    monitorUrl: z
        .string()
        .nonempty()
        .url()
        .openapi({
            example: `https://leademailfinder.com${VERIFY_EMAIL_BULK_STATUS_ROUTE.replace(':id', '1')}`,
        }),
})
