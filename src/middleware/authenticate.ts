import { readFileSync } from 'fs'
import type { NextFunction, Request, Response } from 'express'
import { constants as httpConstants } from 'http2'
import { ok } from 'node:assert'
import { EXIT_FAILURE } from '../common/constants'

function isRecordStringBoolean(value: unknown): value is Record<string, boolean> {
    if (typeof value !== 'object' || value === null) {
        return false
    }

    return Object.entries(value).every(([key, val]) => typeof key === 'string' && typeof val === 'boolean')
}

function readTokens(): Record<string, boolean> {
    const { env } = process
    const { AUTH_TOKENS_FILE_PATH } = env

    try {
        ok(AUTH_TOKENS_FILE_PATH !== undefined, 'The environment variable AUTH_TOKENS_FILE_PATH is required')
        const tokens: unknown = JSON.parse(readFileSync(AUTH_TOKENS_FILE_PATH, { encoding: 'ascii' }))
        ok(isRecordStringBoolean(tokens), 'Invalid tokens file, should be Record<string, boolean>')
        return tokens
    } catch (error) {
        console.debug('Failed to read the file with API tokens: ', error)
        process.exit(EXIT_FAILURE)
    }
}

const tokens = readTokens()

export function authenticate(req: Request, res: Response, next: NextFunction): void {
    const { headers } = req
    const { authorization } = headers

    if (authorization !== undefined) {
        const [, token] = authorization.split(' ')

        if (tokens[token]) {
            next()
            return
        }
    }

    res.status(httpConstants.HTTP_STATUS_UNAUTHORIZED).json('Unauthorized')
}
