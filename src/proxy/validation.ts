import { z } from 'zod'

export const createProxySchema = z.object({
    type: z.enum(['http', 'socks4', 'socks5']),
    host: z.string(),
    port: z.number(),
    user: z.string().optional(),
    password: z.string().optional(),
})
