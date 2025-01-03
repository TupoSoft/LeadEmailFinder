import { describe, it } from '@jest/globals'
import { AUTH_LOGIN_ROUTE, AUTH_LOGOUT_ROUTE, AUTH_REGISTER_ROUTE } from './constants'
import express, { Router } from 'express'
import { AuthRouter } from './router'
import request from 'supertest'
import { constants } from 'node:http2'

describe('AuthRouter', () => {
    const app = express()
    const expressRouter = Router()
    const authRouter = new AuthRouter(expressRouter)
    authRouter.init()

    app.use(express.json())
    app.use(expressRouter)

    describe(AUTH_LOGIN_ROUTE, () => {
        it('should return HTTP_OK', async () => {
            await request(app)
                .post(AUTH_LOGIN_ROUTE)
                .expect('Content-Type', /json/)
                .expect({ message: 'Logged in' })
                .expect(constants.HTTP_STATUS_OK)
        })
    })

    describe(AUTH_REGISTER_ROUTE, () => {
        it('should return HTTP_CREATED', async () => {
            await request(app)
                .post(AUTH_REGISTER_ROUTE)
                .expect('Content-Type', /json/)
                .expect({ message: 'Registered' })
                .expect(constants.HTTP_STATUS_CREATED)
        })
    })

    describe(AUTH_LOGOUT_ROUTE, () => {
        it('should return HTTP_OK', async () => {
            await request(app)
                .post(AUTH_LOGOUT_ROUTE)
                .expect('Content-Type', /json/)
                .expect({ message: 'Logged out' })
                .expect(constants.HTTP_STATUS_OK)
        })
    })
})
