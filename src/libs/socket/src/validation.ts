import { z, type ZodType } from 'zod'
import { type NetConnectOpts, Socket } from 'node:net'
import type { ConnectionOptions } from 'node:tls'

export const netConnectOptsValidationSchema = z.object({
    host: z.string().nonempty().optional(),
    port: z.number().int().positive(),
}) satisfies ZodType<NetConnectOpts>

export const connectionOptionsValidationSchema = z.object({
    socket: z.instanceof(Socket),
    host: z.string().nonempty().optional(),
    port: z.number().int().positive().optional(),
}) satisfies ZodType<ConnectionOptions>
