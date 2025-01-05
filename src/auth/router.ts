import type { Router } from 'express'
import { AUTH_LOGIN_ROUTE, AUTH_LOGOUT_ROUTE, AUTH_REGISTER_ROUTE } from './constants'
import type { AuthController } from './controller'
import { validateRequest } from '../middleware'
import { registrationRequestBodySchema } from './validation'

export class AuthRouter {
    constructor(
        private readonly router: Router,
        private readonly authController: AuthController,
    ) {}

    init(): void {
        this.router.post(AUTH_LOGIN_ROUTE, (_req, res) => {
            res.json({ message: 'Logged in' })
        })

        this.router.post(
            AUTH_REGISTER_ROUTE,
            validateRequest(registrationRequestBodySchema, 'body'),
            this.authController.register.bind(this.authController),
        )

        this.router.post(AUTH_LOGOUT_ROUTE, (_req, res) => {
            res.json({ message: 'Logged out' })
        })
    }
}
