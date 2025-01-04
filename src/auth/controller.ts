import type { AuthService } from './service'
import type { NextFunction, Request, Response } from 'express'
import type { RegistrationData } from './dto'
import { constants } from 'node:http2'
import { UserAlreadyExistsError } from '../user/errors'

export class AuthController {
    constructor(private readonly authService: AuthService) {}

    register(req: Request<object, object, RegistrationData>, res: Response, next: NextFunction): void {
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
                    res.status(constants.HTTP_STATUS_CONFLICT).json({ message })
                } else {
                    next(err)
                }
            },
        )
    }
}
