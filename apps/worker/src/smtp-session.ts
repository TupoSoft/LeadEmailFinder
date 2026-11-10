import { once } from 'node:events'
import { Socket } from 'node:net'
import { TLSSocket } from 'node:tls'
import { RawRecipientObservation } from '@tuposoft/lead-email-finder-verification-contracts'
import { parseSmtpResponse } from './smtp.util'
import { SmtpResponse } from './smtp-response.interface'
import { connect, ConnectionTimeoutError, readUntil, tlsConnectAsync, write } from './libs/socket/src'

export interface SmtpIdentity {
    ehloHostname: string
    mailFrom: string
    ca?: string[]
}

export interface SmtpObservation extends RawRecipientObservation {
    blacklisted: boolean
    senderBlocked: boolean
}

export class SmtpReplyError extends Error {
    constructor(readonly reason: 'blacklisted' | 'sender_blocked' | 'secure_transport_unavailable' | 'no_connect') {
        super(reason)
    }
}

export class SmtpSession {
    private socket: Socket | TLSSocket
    private readonly abort: () => void

    constructor(
        private readonly signal: AbortSignal,
        private readonly identity: SmtpIdentity,
        private readonly port = 25,
        private readonly stageTimeoutMs = 30_000,
    ) {
        signal.throwIfAborted()

        this.socket = new Socket()
        this.socket.on('error', () => {})
        this.abort = () => {
            this.socket.destroy()
        }

        signal.addEventListener('abort', this.abort, { once: true })
    }

    async probe(address: string, exchange: string, email: string): Promise<SmtpObservation> {
        this.signal.throwIfAborted()

        try {
            this.socket = await connect({
                host: address,
                port: this.port,
                socket: this.socket,
                signal: this.signal,
                timeout: this.stageTimeoutMs,
            })
        } catch (error) {
            if (error instanceof ConnectionTimeoutError) {
                throw new DOMException('SMTP connection timed out', 'TimeoutError')
            }

            throw error
        }

        const greeting = await this.read()
        if (greeting.code !== 220) {
            throw new SmtpReplyError(this.replyFailure(greeting, exchange, 'no_connect'))
        }

        const ehlo = await this.command(`EHLO ${this.identity.ehloHostname}`)
        if (ehlo.code !== 250 || !ehlo.capabilities.includes('STARTTLS')) {
            throw new SmtpReplyError(this.replyFailure(ehlo, exchange, 'secure_transport_unavailable'))
        }

        const startTls = await this.command('STARTTLS')
        if (startTls.code !== 220) {
            throw new SmtpReplyError(this.replyFailure(startTls, exchange, 'secure_transport_unavailable'))
        }

        this.signal.throwIfAborted()

        try {
            this.socket = await tlsConnectAsync(
                {
                    socket: this.socket,
                    servername: exchange,
                    rejectUnauthorized: true,
                    ...(this.identity.ca ? { ca: this.identity.ca } : {}),
                },
                AbortSignal.any([this.signal, AbortSignal.timeout(this.stageTimeoutMs)]),
            )
            this.socket.on('error', () => {})
        } catch {
            this.signal.throwIfAborted()
            throw new SmtpReplyError('secure_transport_unavailable')
        }

        if (!(this.socket instanceof TLSSocket) || !this.socket.authorized) {
            throw new Error('secure_transport_unavailable')
        }

        const secureEhlo = await this.command(`EHLO ${this.identity.ehloHostname}`)
        if (secureEhlo.code !== 250) {
            throw new Error('secure_transport_unavailable')
        }

        const sender = await this.command(`MAIL FROM:<${this.identity.mailFrom}>`)
        if (sender.code !== 250) {
            return this.observation(sender, 'mail_from', false, exchange)
        }

        const recipient = await this.command(`RCPT TO:<${email}>`)
        const observation = this.observation(recipient, 'rcpt_to', true, exchange)

        // QUIT is cleanup; a later transport failure must not erase decisive recipient evidence.
        await this.command('QUIT').catch(() => {})

        return observation
    }

    async close(): Promise<void> {
        this.signal.removeEventListener('abort', this.abort)

        if (this.socket.closed) {
            return
        }

        const closed = once(this.socket, 'close').catch(() => {})
        this.socket.destroy()
        await closed
    }

    private observation(
        response: SmtpResponse,
        stage: RawRecipientObservation['stage'],
        senderAccepted: boolean,
        exchange: string,
    ): SmtpObservation {
        return {
            stage,
            code: response.code,
            enhancedCode: response.enhancedCode,
            verifiedTransport: true,
            senderAccepted,
            observedAt: new Date(),
            origin: 'fresh',
            blacklisted: response.code >= 400 && /block|banned|rbl/i.test(response.message),
            senderBlocked:
                response.code >= 400 &&
                /mimecast/i.test(exchange) &&
                /Administrative prohibition/i.test(response.message),
        }
    }

    private replyFailure(
        response: SmtpResponse,
        exchange: string,
        fallback: SmtpReplyError['reason'],
    ): SmtpReplyError['reason'] {
        const senderBlocked =
            response.code >= 400 && /mimecast/i.test(exchange) && /Administrative prohibition/i.test(response.message)

        if (senderBlocked) {
            return 'sender_blocked'
        }

        if (response.code >= 400 && /block|banned|rbl/i.test(response.message)) {
            return 'blacklisted'
        }

        return fallback
    }

    private async command(command: string): Promise<SmtpResponse> {
        this.signal.throwIfAborted()
        await write(this.socket, `${command}\r\n`, this.signal)

        return this.read()
    }

    private async read(): Promise<SmtpResponse> {
        const stageSignal = AbortSignal.any([this.signal, AbortSignal.timeout(this.stageTimeoutMs)])

        try {
            const response = await readUntil(this.socket, /^\d{3} [^\r\n]*\r?\n/m, 64 * 1024, stageSignal)

            if (!response) {
                throw new Error('smtp_connection_closed')
            }

            return parseSmtpResponse(response)
        } catch (error) {
            this.socket.destroy()
            throw error
        }
    }
}
