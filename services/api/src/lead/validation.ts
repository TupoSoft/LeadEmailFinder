import 'zod-openapi/extend'
import { z, type ZodType } from 'zod'
import type { FindLeadRequest, FindLeadResult } from './dto'
import { verifyEmailResponseBody } from '../email-verification/validation'

export const findLeadRequestBodySchema = z.intersection(
    z.object({ domain: z.string().nonempty().openapi({ example: 'microsoft.com' }) }),
    z.union(
        [
            z.object({
                firstName: z.string().nonempty().openapi({ example: 'Danilo' }),
                lastName: z.string().nonempty().optional().openapi({ example: 'Homic' }),
            }),
            z.object({
                firstName: z.string().nonempty().readonly().optional().openapi({ example: 'Danilo' }),
                lastName: z.string().nonempty().readonly().openapi({ example: 'Homic' }),
            }),
        ],
        { errorMap: () => ({ message: 'Either first name or last name must be filled in.' }) },
    ),
) satisfies ZodType<FindLeadRequest>

export const findLeadResponseBodySchema = z.intersection(
    findLeadRequestBodySchema,
    z.object({
        emails: z.array(verifyEmailResponseBody),
    }),
) satisfies ZodType<FindLeadResult>

export const findLeadBulkRequestBodySchema = z.array(findLeadRequestBodySchema)

export const findLeadBulkResultResponseBodySchema = z.array(findLeadResponseBodySchema)
