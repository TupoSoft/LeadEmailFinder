import type { Router } from 'express'
import { type IAuthMiddleware, validate } from '../../middleware'
import type { LegacyEmailVerificationController } from './legacy-controller'
import { query } from 'express-validator'
import { VERIFY_EMAIL_ROUTE_LEGACY } from './constants'

export class LegacyEmailVerificationRouter {
    constructor(
        private readonly router: Router,
        private readonly authMiddleware: IAuthMiddleware,
        private readonly emailVerificationControllerOld: LegacyEmailVerificationController,
    ) {}

    init(): void {
        this.router.get(
            VERIFY_EMAIL_ROUTE_LEGACY,
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            validate([
                query('email')
                    .isString()
                    .withMessage('The email should be a string')
                    .notEmpty()
                    .withMessage('Email should not be empty')
                    .isEmail()
                    .withMessage('Invalid email address'),
            ]),
            this.emailVerificationControllerOld.verify.bind(this.emailVerificationControllerOld),
        )
    }
}
