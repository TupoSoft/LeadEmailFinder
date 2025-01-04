import { z, type ZodType } from 'zod'
import type { FindLeadRequest } from './dto'

const MIN_LENGTH = 1

export const findLeadRequestBodySchema = z.intersection(
    z.object({ domain: z.string().min(MIN_LENGTH).readonly() }),
    z.union(
        [
            z.object({
                firstName: z.string().min(MIN_LENGTH).readonly(),
                lastName: z.string().min(MIN_LENGTH).readonly().optional(),
            }),
            z.object({
                firstName: z.string().min(MIN_LENGTH).readonly().optional(),
                lastName: z.string().min(MIN_LENGTH).readonly(),
            }),
        ],
        { errorMap: () => ({ message: 'Either first name or last name must be filled in.' }) },
    ),
) satisfies ZodType<FindLeadRequest>

export const findLeadBulkRequestBodySchema = z.array(findLeadRequestBodySchema)
