import { z } from 'zod'
import * as authMail from '../src/libs/better-auth/src/mail/auth-mail-delivery'

export type AuthMailConfiguration = Pick<Env, 'AUTH_EMAIL'> & { AUTH_MAIL_FROM: string }

const hostnameSchema = z.hostname()
const emailAddressSchema = z.email().refine(address => hostnameSchema.safeParse(address.split('@')[1]).success)

export function validateAuthMailConfiguration(configuration: AuthMailConfiguration): string | EmailAddress {
    const from = configuration.AUTH_MAIL_FROM

    if (typeof from !== 'string' || /[\r\n]/.test(from) || from.includes('\0')) {
        throw new Error('AUTH_MAIL_FROM must be a single email address, optionally with a display name.')
    }

    const namedAddress = /^([^<>"\r\n]+) <([^<>]+)>$/.exec(from)
    const address = namedAddress?.[2] ?? from

    if (!emailAddressSchema.safeParse(address).success || (namedAddress && !namedAddress[1].trim())) {
        throw new Error('AUTH_MAIL_FROM must be a single email address, optionally with a display name.')
    }

    if (!configuration.AUTH_EMAIL || typeof configuration.AUTH_EMAIL.send !== 'function') {
        throw new Error('AUTH_EMAIL must be an Email Service send binding.')
    }

    if (namedAddress) {
        return { name: namedAddress[1].trim(), email: address }
    }

    return address
}

export function createAuthMailDelivery(configuration: AuthMailConfiguration): authMail.AuthMailDelivery {
    const from = validateAuthMailConfiguration(configuration)

    return {
        async send(message: authMail.AuthMailMessage): Promise<void> {
            if (
                !emailAddressSchema.safeParse(message.to).success ||
                /[\r\n]/.test(message.to) ||
                !message.subject.trim() ||
                /[\r\n]/.test(message.subject) ||
                message.subject.includes('\0') ||
                !message.text.trim()
            ) {
                throw new authMail.AuthMailDeliveryError('invalid-message')
            }

            try {
                await configuration.AUTH_EMAIL.send({
                    from,
                    to: message.to,
                    subject: message.subject,
                    text: message.text,
                })
            } catch (error: unknown) {
                // Provider errors may contain the recipient, link, or raw message. Retain only a bounded reason.
                throw new authMail.AuthMailDeliveryError(deliveryFailureReason(error))
            }
        },
    }
}

function deliveryFailureReason(error: unknown): authMail.AuthMailDeliveryError['reason'] {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined

    switch (code) {
        case 'E_VALIDATION_ERROR':
        case 'E_FIELD_MISSING':
        case 'E_CONTENT_TOO_LARGE':
            return 'invalid-message'

        case 'E_SENDER_NOT_VERIFIED':
        case 'E_SENDER_DOMAIN_NOT_AVAILABLE':
        case 'E_RECIPIENT_NOT_ALLOWED':
        case 'E_RECIPIENT_SUPPRESSED':
        case 'E_ACCOUNT_SUSPENDED':
            return 'rejected'

        default:
            return 'unavailable'
    }
}
