/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- testing */
import { describe, it, jest } from '@jest/globals'
import { AUTH_LOGIN_ROUTE, AUTH_LOGOUT_ROUTE, AUTH_REGISTER_ROUTE, AUTH_ROUTE } from './constants'
import express, { Router } from 'express'
import { AuthRouter } from './router'
import request from 'supertest'
import { constants } from 'node:http2'
import { AuthController } from './controller'
import { AuthService } from './service'
import { MongoUserRepository, UserService } from '../user'
import { MongoClient } from 'mongodb'
import type { RegistrationData } from './dto'
import { UserAlreadyExistsError } from '../user/errors'
import Mocked = jest.Mocked

jest.mock('../middleware/authenticate')
jest.mock('../user/mongo-repository')

describe(AUTH_ROUTE, () => {
    const app = express()
    const expressRouter = Router()
    const mongoClient = new MongoClient('mongodb://localhost:27017')
    const db = mongoClient.db()
    const userRepository = new MongoUserRepository(db) as Mocked<MongoUserRepository>
    const userService = new UserService(userRepository)
    const authService = new AuthService(userService)
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
        const registrationData: RegistrationData = {
            email,
            password: 'odeseneradi',
        }

        it('should return HTTP_CREATED', async () => {
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
            userRepository.create.mockRejectedValueOnce(userAlreadyExistsError)

            await request(app)
                .post(AUTH_REGISTER_ROUTE)
                .send(registrationData)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect({ message })
                .expect(constants.HTTP_STATUS_CONFLICT)
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
