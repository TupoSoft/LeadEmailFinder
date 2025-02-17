import { ExistenceStatus, type ExistenceStrategy } from './dto'
import type { SMTPVerificationResult } from '../smtp/dto'
import { ok } from 'node:assert'

export const smtpStrategy: ExistenceStrategy = {
    predicate: results => 'mx' in results,
    action: results => {
        const mx = results.mx as SMTPVerificationResult

        if (mx.catchAll === true || mx.catchAll === undefined) {
            return ExistenceStatus.Unknown
        } else {
            return mx.success ? ExistenceStatus.Exists : ExistenceStatus.DoesNotExist
        }
    },
}

export const mimecastStrategy: ExistenceStrategy = {
    predicate: results => {
        const MIMECAST_DOMAIN = 'mimecast.com'

        if (!('mx' in results)) {
            return false
        }

        const mx = results.mx as SMTPVerificationResult

        return mx.catchAll === true && mx.mxDomain === MIMECAST_DOMAIN && 'mimecast' in results
    },
    action: results => (results.mimecast.success ? ExistenceStatus.Exists : ExistenceStatus.DoesNotExist),
}

export const outlookStrategy: ExistenceStrategy = {
    predicate: results => {
        const OUTLOOK_DOMAINS = ['outlook.com', 'office365.com', 'ppe-hosted.com']

        try {
            ok('outlook' in results)
            ok('mx' in results)

            const mx = results.mx as SMTPVerificationResult

            ok(mx.catchAll === true)
            ok(mx.mxDomain !== undefined)
            ok(OUTLOOK_DOMAINS.includes(mx.mxDomain))

            return true
        } catch (_error) {
            return false
        }
    },
    action: results => (results.outlook.success ? ExistenceStatus.Exists : ExistenceStatus.DoesNotExist),
}

export const microsoftGetCredentialTypeStrategy: ExistenceStrategy = {
    predicate: results => 'o365' in results,
    action: results => (results.o365.success ? ExistenceStatus.Exists : ExistenceStatus.DoesNotExist),
}
