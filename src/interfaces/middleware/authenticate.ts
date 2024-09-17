import { readFileSync } from 'fs'
import type { NextFunction, Request, Response } from 'express'
import { constants as httpConstants } from 'http2'
import path from 'node:path'

const tokensFilePath = path.join(__dirname, '../../config/tokens.json')

function readTokens(): Record<string, boolean> {
    try {
        return JSON.parse(readFileSync(tokensFilePath, { encoding: 'ascii' }))
    } catch (_) {
        console.debug('Failed to read the file with API tokens.')
        process.exit(1)
    }
}

const tokens = readTokens()

export default function authenticate(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization
    const token = authHeader?.split(' ')[1]

    if (token == null || !tokens[token]) res.status(httpConstants.HTTP_STATUS_UNAUTHORIZED).send('Unauthorized')
    else next()
}
