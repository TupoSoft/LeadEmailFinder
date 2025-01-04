import { z, type ZodType } from 'zod'
import type { RegistrationData } from './dto'
import { EMAIL_MINIMUM_LENGTH, PASSWORD_MINIMUM_LENGTH } from './constants'

export const registrationRequestBodySchema = z.object({
    email: z
        .string({ message: 'Email is required' })
        .min(EMAIL_MINIMUM_LENGTH, { message: 'Email must be at least 3 characters' })
        .email({ message: 'Invalid email address' })
        .nonempty({ message: 'Email cannot be empty' }),
    password: z
        .string({
            message: 'Password is required',
        })
        .min(PASSWORD_MINIMUM_LENGTH, { message: 'Password must be at least 8 characters' })
        .nonempty({ message: 'Password cannot be empty' }),
}) satisfies ZodType<RegistrationData>
