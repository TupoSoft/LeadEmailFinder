import type { Router } from 'express'
import { VERIFY_EMAIL_ROUTE_LEGACY } from './constants'
import { type AuthMiddleware, validate } from '../middleware'
import { query } from 'express-validator'
import type { LegacyEmailVerificationController } from './legacy-controller'

export class LegacyEmailVerificationRouter {
    constructor(
        private readonly router: Router,
        private readonly authMiddleware: AuthMiddleware,
        private readonly emailVerificationControllerOld: LegacyEmailVerificationController,
    ) {}

    init(): void {
        this.router.get(
            VERIFY_EMAIL_ROUTE_LEGACY,
            this.authMiddleware.authenticate.bind(this.authMiddleware),
            validate([query('email').isEmail().notEmpty().escape()]),
            this.emailVerificationControllerOld.verify.bind(this.emailVerificationControllerOld),
        )
    }
}
