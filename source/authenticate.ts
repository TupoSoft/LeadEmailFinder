import {readFileSync} from "fs";
import {NextFunction, Request, Response} from "express";
import {constants as httpConstants} from "http2";

const tokensFilePath = 'source/config/tokens.json'

function readTokens(): Record<string, boolean> {
    try {
        return JSON.parse(readFileSync(tokensFilePath, {encoding: 'ascii'}))
    } catch (_) {
        console.debug(`Failed to read the file with API tokens.`)
        process.exit(1)
    }
}

const tokens = readTokens()

export default async function authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (!token || !tokens[token]) res.status(httpConstants.HTTP_STATUS_UNAUTHORIZED).send('Unauthorized')
    else next()
}
