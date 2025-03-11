import { constants } from 'node:http2'

export class HttpError extends Error {
    readonly status

    constructor(status: number, message: string) {
        super(message)

        this.status = status
        this.name = 'HttpError'
    }

    static BadRequest(message: string): HttpError {
        return new HttpError(constants.HTTP_STATUS_BAD_REQUEST, message)
    }

    static NotFound(message: string): HttpError {
        return new HttpError(constants.HTTP_STATUS_NOT_FOUND, message)
    }

    static Unauthorized(message: string): HttpError {
        return new HttpError(constants.HTTP_STATUS_UNAUTHORIZED, message)
    }

    static Conflict(message: string): HttpError {
        return new HttpError(constants.HTTP_STATUS_CONFLICT, message)
    }

    static InternalServerError(): HttpError {
        return new HttpError(constants.HTTP_STATUS_INTERNAL_SERVER_ERROR, 'Internal server error')
    }

    static UnavailableForLegalReasons(message = 'Unavailable for legal reasons'): HttpError {
        return new HttpError(constants.HTTP_STATUS_UNAVAILABLE_FOR_LEGAL_REASONS, message)
    }
}
