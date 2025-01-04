import { z, type ZodType } from 'zod'
import type { RegistrationData } from './dto'

export const registrationRequestBodySchema = z.object({
    email: z.string().email().nonempty({ message: 'Email is required' }),
    password: z.string().nonempty({ message: 'Password is required' }),
}) satisfies ZodType<RegistrationData>
