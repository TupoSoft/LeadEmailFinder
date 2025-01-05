import { describe, it, jest } from '@jest/globals'
import { AUTH_LOGIN_ROUTE, AUTH_LOGOUT_ROUTE, AUTH_REGISTER_ROUTE, AUTH_ROUTE } from './constants'
import express, { Router } from 'express'
import { AuthRouter } from './router'
import request from 'supertest'
import { constants } from 'node:http2'
import { AuthController } from './controller'
import type { IAuthService } from './service'
import type { AuthData, LoginResult } from './dto'
import { UserAlreadyExistsError } from '../user/errors'
import { InvalidAuthDataError } from './errors'
import Mocked = jest.Mocked

jest.mock('../middleware/authenticate')
jest.mock('./util/password')

describe(AUTH_ROUTE, () => {
    const app = express()
    const expressRouter = Router()
    const authService: Mocked<IAuthService> = {
        register: jest.fn<typeof authService.register>(),
        login: jest.fn<typeof authService.login>(),
    }
    const authController = new AuthController(authService)
    const authRouter = new AuthRouter(expressRouter, authController)
    authRouter.init()

    app.use(express.json())
    app.use(expressRouter)

    const email = 'danilo@microsoft.com'
    const password = 'odeseneradi'
    const authData: AuthData = {
        email,
        password,
    }

    describe(AUTH_LOGIN_ROUTE, () => {
        const token = 'header.payload.signature'
        const loginResult: LoginResult = {
            token,
        }

        it('should return HTTP_OK', async () => {
            authService.login.mockResolvedValueOnce(loginResult)

            await request(app)
                .post(AUTH_LOGIN_ROUTE)
                .send(authData)
                .expect('Content-Type', /json/)
                .expect(loginResult)
                .expect(constants.HTTP_STATUS_OK)
        })

        it('should return HTTP_UNAUTHORIZED when the password does not match', async () => {
            const error = new InvalidAuthDataError()
            const { message } = error
            authService.login.mockRejectedValueOnce(error)

            await request(app)
                .post(AUTH_LOGIN_ROUTE)
                .send(authData)
                .expect('Content-Type', /json/)
                .expect({ message })
                .expect(constants.HTTP_STATUS_UNAUTHORIZED)
        })
    })

    describe(AUTH_REGISTER_ROUTE, () => {
        it('should return HTTP_CREATED', async () => {
            authService.register.mockResolvedValueOnce()

            await request(app)
                .post(AUTH_REGISTER_ROUTE)
                .send(authData)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect({ message: `The user with email ${email} has been successfully registered` })
                .expect(constants.HTTP_STATUS_CREATED)
        })

        it('should return HTTP_CONFLICT when the email is in the DB', async () => {
            const userAlreadyExistsError = new UserAlreadyExistsError(email)
            const { message } = userAlreadyExistsError
            authService.register.mockRejectedValueOnce(userAlreadyExistsError)

            await request(app)
                .post(AUTH_REGISTER_ROUTE)
                .send(authData)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect({ message })
                .expect(constants.HTTP_STATUS_CONFLICT)
        })

        const invalidEmail = 'danilo'
        const validationCases: Array<{
            description: string
            requestBody: Partial<AuthData>
            message: string
        }> = [
            { description: 'email is missing', requestBody: { password }, message: 'Email is required' },
            { description: 'password is missing', requestBody: { email }, message: 'Password is required' },
            { description: 'email is invalid', requestBody: { email: invalidEmail }, message: 'Invalid email address' },
        ]

        it.each(validationCases)(
            'should return HTTP_STATUS_BAD_REQUEST when $description',
            async ({ requestBody, message }) => {
                await request(app)
                    .post(AUTH_REGISTER_ROUTE)
                    .send(requestBody)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/json')
                    .expect('Content-Type', /json/)
                    .expect({ message })
                    .expect(constants.HTTP_STATUS_BAD_REQUEST)
            },
        )
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
