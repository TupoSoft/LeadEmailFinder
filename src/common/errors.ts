import { constants } from 'node:http2'

export class HttpError extends Error {
    private readonly status

    constructor(status: number, message: string) {
        super(message)

        this.name = 'HttpError'
        this.status = status
    }

    static BadRequest(message: string): HttpError {
        return new HttpError(constants.HTTP_STATUS_BAD_REQUEST, message)
    }

    static NotFound(message: string): HttpError {
        return new HttpError(constants.HTTP_STATUS_NOT_FOUND, message)
    }
}
