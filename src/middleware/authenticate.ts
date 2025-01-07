import type { NextFunction, Request, Response } from 'express'
import { constants as httpConstants } from 'http2'
import { ok } from 'node:assert'
import { type ConfigService, type Environment, EXIT_FAILURE } from '../common'
import type { Logger } from '../logging'

function isRecordStringBoolean(value: unknown): value is Record<string, boolean> {
    if (typeof value !== 'object' || value === null) {
        return false
    }

    return Object.entries(value).every(([key, val]) => typeof key === 'string' && typeof val === 'boolean')
}

export interface IAuthMiddleware {
    authenticate: (req: Request, res: Response, next: NextFunction) => void
}

export class AuthMiddleware implements IAuthMiddleware {
    private readonly tokens

    constructor(
        private readonly config: ConfigService<Environment>,
        private readonly logger: Logger,
    ) {
        this.tokens = this.readTokens()
    }

    authenticate(req: Request, res: Response, next: NextFunction): void {
        const { headers } = req
        const { authorization } = headers

        if (authorization !== undefined) {
            const [, token] = authorization.split(' ')

            if (this.tokens[token]) {
                next()
                return
            }
        }

        res.status(httpConstants.HTTP_STATUS_UNAUTHORIZED).json('Unauthorized')
    }

    private readTokens(): Record<string, boolean> {
        try {
            const authTokens = this.config.get('AUTH_TOKENS')
            const tokens: unknown = JSON.parse(authTokens)
            ok(isRecordStringBoolean(tokens), 'Invalid tokens file, should be Record<string, boolean>')
            return tokens
        } catch (error) {
            this.logger.error(`Failed to read the file with API tokens: ${String(error)}`)
            process.exit(EXIT_FAILURE)
        }
    }
}
