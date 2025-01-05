import { describe, it, jest } from '@jest/globals'
import { AUTH_LOGIN_ROUTE, AUTH_LOGOUT_ROUTE, AUTH_REGISTER_ROUTE, AUTH_ROUTE } from './constants'
import express, { Router } from 'express'
import { AuthRouter } from './router'
import request from 'supertest'
import { constants } from 'node:http2'
import { AuthController } from './controller'
import type { IAuthService } from './service'
import type { RegistrationData } from './dto'
import { UserAlreadyExistsError } from '../user/errors'
import Mocked = jest.Mocked

jest.mock('../middleware/authenticate')

describe(AUTH_ROUTE, () => {
    const app = express()
    const expressRouter = Router()
    const authService: Mocked<IAuthService> = {
        register: jest.fn<typeof authService.register>(),
    }
    const authController = new AuthController(authService)
    const authRouter = new AuthRouter(expressRouter, authController)
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
        const email = 'danilo@microsoft.com'
        const password = 'odeseneradi'
        const registrationData: RegistrationData = {
            email,
            password,
        }

        it('should return HTTP_CREATED', async () => {
            authService.register.mockResolvedValueOnce()

            await request(app)
                .post(AUTH_REGISTER_ROUTE)
                .send(registrationData)
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
                .send(registrationData)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect({ message })
                .expect(constants.HTTP_STATUS_CONFLICT)
        })

        const invalidEmail = 'danilo'
        const validationCases: { description: string; requestBody: Partial<RegistrationData>; message: string }[] = [
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
