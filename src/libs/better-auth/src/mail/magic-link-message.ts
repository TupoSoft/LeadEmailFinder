import { AuthMailMessage } from './auth-mail-delivery'

const LINK_LIFETIME_MINUTES = 5

/** Plain-text sign-in message; the link is the only secret and is never logged by the delivery adapter. */
export function createMagicLinkMessage(to: string, url: string): AuthMailMessage {
    return {
        to,
        subject: 'Your Lead Email Finder sign-in link',
        text: [
            'Use this link to sign in to Lead Email Finder:',
            '',
            url,
            '',
            `The link expires in ${LINK_LIFETIME_MINUTES} minutes and works once.`,
            'If you did not request it, you can ignore this email.',
        ].join('\n'),
    }
}

export const MAGIC_LINK_LIFETIME_SECONDS = LINK_LIFETIME_MINUTES * 60
