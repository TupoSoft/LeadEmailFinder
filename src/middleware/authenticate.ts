import { readFileSync } from 'fs'
import type { NextFunction, Request, Response } from 'express'
import { constants as httpConstants } from 'http2'
import path from 'node:path'
import { ok } from 'node:assert'

const tokensFilePath = path.join('src/config/tokens.json')

function isRecordStringBoolean(value: unknown): value is Record<string, boolean> {
    if (typeof value !== 'object' || value === null) {
        return false
    }

    return Object.entries(value).every(([key, val]) => typeof key === 'string' && typeof val === 'boolean')
}

function readTokens(): Record<string, boolean> {
    try {
        const tokens: unknown = JSON.parse(readFileSync(tokensFilePath, { encoding: 'ascii' }))
        ok(isRecordStringBoolean(tokens), 'Invalid tokens file, should be Record<string, boolean>')
        return tokens
    } catch (error) {
        console.debug('Failed to read the file with API tokens: ', error)
        process.exit(1)
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

    res.status(httpConstants.HTTP_STATUS_UNAUTHORIZED).send('Unauthorized')
}
