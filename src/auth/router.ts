import type { Router } from 'express'
import { AUTH_LOGIN_ROUTE, AUTH_LOGOUT_ROUTE, AUTH_REGISTER_ROUTE } from './constants'
import { constants } from 'node:http2'

export class AuthRouter {
    constructor(private readonly router: Router) {}

    init(): void {
        this.router.post(AUTH_LOGIN_ROUTE, (_req, res) => {
            res.json({ message: 'Logged in' })
        })

        this.router.post(AUTH_REGISTER_ROUTE, (_req, res) => {
            res.status(constants.HTTP_STATUS_CREATED).json({ message: 'Registered' })
        })

        this.router.post(AUTH_LOGOUT_ROUTE, (_req, res) => {
            res.json({ message: 'Logged out' })
        })
    }
}
