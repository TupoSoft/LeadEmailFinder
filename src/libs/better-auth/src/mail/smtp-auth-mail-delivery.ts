import { createTransport } from 'nodemailer'
import type { AuthMailTransportConfiguration } from '../better-auth-configuration'
import { AuthMailDelivery, AuthMailDeliveryError, AuthMailMessage } from './auth-mail-delivery'

const CONNECTION_TIMEOUT_MS = 10_000
const SOCKET_TIMEOUT_MS = 15_000
const SEND_DEADLINE_MS = 30_000
const RECIPIENT_PATTERN = /^[^\s@<>"]+@[^\s@<>"]+$/

export interface AuthMailTransportMessage {
    readonly from: string
    readonly to: string
    readonly subject: string
    readonly text: string
}

/** The small part of an SMTP client this adapter needs; tests substitute it without opening sockets. */
export interface AuthMailTransport {
    sendMail(message: AuthMailTransportMessage): Promise<unknown>
    close(): void
}

export function createNodemailerTransport(configuration: AuthMailTransportConfiguration): AuthMailTransport {
    return createTransport({
        host: configuration.host,
        port: configuration.port,
        secure: configuration.secure,
        requireTLS: configuration.requireTls,
        ...(configuration.user === undefined
            ? {}
            : { auth: { user: configuration.user, pass: configuration.password } }),
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: CONNECTION_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
        // Transport logs would include recipients, envelopes, and message bodies containing sign-in links.
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
    })
}

export class SmtpAuthMailDelivery implements AuthMailDelivery {
    constructor(
        private readonly transport: AuthMailTransport,
        private readonly from: string,
        private readonly sendDeadlineMs = SEND_DEADLINE_MS,
    ) {}

    async send(message: AuthMailMessage): Promise<void> {
        if (!isDeliverable(message)) throw new AuthMailDeliveryError('invalid-message')

        let timer: NodeJS.Timeout | undefined
        const deadline = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new AuthMailDeliveryError('unavailable')), this.sendDeadlineMs)
        })
        try {
            await Promise.race([
                this.transport.sendMail({
                    from: this.from,
                    to: message.to,
                    subject: message.subject,
                    text: message.text,
                }),
                deadline,
            ])
        } catch (error: unknown) {
            if (error instanceof AuthMailDeliveryError) throw error
            throw new AuthMailDeliveryError(isPermanentRejection(error) ? 'rejected' : 'unavailable')
        } finally {
            clearTimeout(timer)
        }
    }

    close(): void {
        this.transport.close()
    }
}

function isDeliverable({ to, subject, text }: AuthMailMessage): boolean {
    return RECIPIENT_PATTERN.test(to) && subject.length > 0 && !/[\r\n]/.test(subject) && text.length > 0
}

function isPermanentRejection(error: unknown): boolean {
    const code = (error as { responseCode?: unknown } | null)?.responseCode
    return typeof code === 'number' && code >= 500 && code < 600
}
