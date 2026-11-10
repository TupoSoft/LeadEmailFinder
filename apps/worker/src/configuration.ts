import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { SmtpIdentity } from './smtp-session'
import { loadSmtpTlsCa } from './smtp-trust'

const configurationSchema = z.object({
    CLOUDFLARE_ACCOUNT_ID: z.string().regex(/^[a-fA-F0-9]{32}$/),
    CLOUDFLARE_API_TOKEN: z.string().min(1),
    VERIFICATION_QUEUE_ID: z.string().regex(/^[a-fA-F0-9]{32}$/),
    VERIFICATION_RESULTS_QUEUE_ID: z.string().regex(/^[a-fA-F0-9]{32}$/),
    SMTP_EHLO_HOSTNAME: z.hostname().refine(value => value.includes('.') && !/[\r\n]/.test(value)),
    SMTP_MAIL_FROM: z.email(),
    SMTP_TLS_CA_FILE: z.string().optional(),
})

export type WorkerConfiguration = z.infer<typeof configurationSchema>

export function loadConfiguration(environment: NodeJS.ProcessEnv = process.env): WorkerConfiguration {
    const values = { ...environment }
    const tokenFile = environment.CLOUDFLARE_API_TOKEN_FILE

    if (tokenFile) {
        if (environment.CLOUDFLARE_API_TOKEN) {
            throw new Error('worker_secret_configuration_ambiguous')
        }

        values.CLOUDFLARE_API_TOKEN = readFileSync(tokenFile, 'utf8').trimEnd()
    }

    const parsed = configurationSchema.safeParse(values)
    if (!parsed.success) {
        const invalidFields = parsed.error.issues.map(issue => issue.path.join('.')).join(',')
        throw new Error(`worker_configuration_invalid:${invalidFields}`)
    }

    return parsed.data
}

export function smtpIdentity(configuration: WorkerConfiguration): SmtpIdentity {
    return {
        ehloHostname: configuration.SMTP_EHLO_HOSTNAME,
        mailFrom: configuration.SMTP_MAIL_FROM,
        ...(configuration.SMTP_TLS_CA_FILE ? { ca: loadSmtpTlsCa(configuration.SMTP_TLS_CA_FILE) } : {}),
    }
}
