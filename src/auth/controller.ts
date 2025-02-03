import type { IAuthService } from './service'
import type { NextFunction, Request, Response } from 'express'
import type { AuthData } from './dto'
import { constants } from 'node:http2'
import { UserAlreadyExistsError } from '../user/errors'
import { InvalidAuthDataError } from './errors'
import { HttpError } from '../common'

export class AuthController {
    constructor(private readonly authService: IAuthService) {}

    register(req: Request<object, object, AuthData>, res: Response, next: NextFunction): void {
        const { body: registrationData } = req
        const { email } = registrationData
        this.authService.register(registrationData).then(
            () => {
                res.status(constants.HTTP_STATUS_CREATED).json({
                    message: `The user with email ${email} has been successfully registered`,
                })
            },
            (err: unknown) => {
                if (err instanceof UserAlreadyExistsError) {
                    const { message } = err
                    next(HttpError.Conflict(message))
                } else {
                    next(err)
                }
            },
        )
    }

    login(req: Request<object, object, AuthData>, res: Response, next: NextFunction): void {
        const { body: authData } = req
        this.authService.login(authData).then(
            value => {
                res.status(constants.HTTP_STATUS_OK).json(value)
            },
            (err: unknown) => {
                if (err instanceof InvalidAuthDataError) {
                    const { message } = err
                    next(HttpError.Unauthorized(message))
                } else {
                    next(err)
                }
            },
        )
    }

    refresh(req: Request<object, object, AuthData>, res: Response, next: NextFunction): void {
        const { body: authData } = req
        this.authService.login(authData).then(
            value => {
                res.status(constants.HTTP_STATUS_OK).json(value)
            },
            (err: unknown) => {
                if (err instanceof InvalidAuthDataError) {
                    const { message } = err
                    next(HttpError.Unauthorized(message))
                } else {
                    next(err)
                }
            },
        )
    }
}
