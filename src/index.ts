import express, { type NextFunction, type Request, type Response, Router } from 'express'
import { MongoClientCreator } from './util/mongo'
import {
    CatchAllVerifier,
    EmailVerificationRouter,
    EmailVerificationService,
    EmailVerifier,
    ExpressEmailVerificationController,
    MongoEmailVerificationRepository,
    RedisCatchAllCache,
} from './email-verification'
import axios from 'axios'
import { AxiosHttpClient } from './http-client'
import { DomainControllerImpl, DomainRouter, DomainService, MongoDomainRepository } from './domain'
import { constants as httpConstants } from 'http2'
import { RedisConnectionLimiter, SmtpClientCreatorImpl, SMTPVerifier } from './smtp'
import { DNSCacheImpl } from './dns'
import { LeadController, LeadFinder, LeadQueue, LeadRouter, LeadService } from './lead'
import { MongoProxyRepository, ProxyService } from './proxy'
import { ProxyController } from './proxy/controller'
import { ProxyRouter } from './proxy/router'
import pinoFactory from 'pino'
import pinoHttp from 'pino-http'
import { PinoLogger } from './logging'
import { ok } from 'node:assert'
import { API_PREFIX, ConfigService, type Environment, EXIT_FAILURE, parseEnv } from './common'
import { RedisCreator } from './util/redis'
import { isNativeError } from 'node:util/types'
import {
    PersistenceEmailVerifierDecorator,
    ThrowableEmailVerifierDecorator,
} from './email-verification/verifier-decorators'
import { LeadQueueWorker } from './lead/queue-worker'
import { AuthRouter } from './auth/router'
import { AuthController } from './auth/controller'
import { AuthService } from './auth/service'
import { MongoUserRepository, UserService } from './user'
import { AuthMiddleware } from './middleware'
import { JwtService } from './auth/jwt'
import { EmailVerificationQueue } from './email-verification/queue'
import { EmailVerificationQueueWorker } from './email-verification/queue-worker'
import { Queue } from 'bullmq'
import { RESOURCE as EMAILS } from './email-verification/constants'
import { createDocument } from 'zod-openapi'
import { leadPaths, leadTag } from './lead/openapi'
import { serve, setup } from 'swagger-ui-express'
import { emailPaths, emailTag } from './email-verification/openapi'

async function main(): Promise<void> {
    const environment = await parseEnv()
    const configService = new ConfigService<Environment>(environment)

    const pino = pinoFactory({
        level: configService.get('NODE_ENV') !== 'production' ? 'debug' : 'info',
    })

    const logger = new PinoLogger(pino)
    const pinoLoggingMiddleware = pinoHttp({
        logger: pino,
    })

    const router = Router()
    const mongoClientCreator = new MongoClientCreator(configService, logger)
    const mongoClient = await mongoClientCreator.create()
    const db = mongoClient.db()

    const redisCreator = new RedisCreator(configService, logger)
    const redis = redisCreator.create()

    const mongoUserRepository = new MongoUserRepository(db)
    const userService = new UserService(mongoUserRepository)
    await mongoUserRepository.createIndices()

    const jwtService = new JwtService({
        issuer: configService.get('JWT_ISSUER'),
        audience: configService.get('JWT_AUDIENCE'),
        secret: configService.get('JWT_HS256_SECRET'),
        expiration: configService.get('JWT_EXPIRATION'),
    })
    const authService = new AuthService(userService, jwtService)
    const authController = new AuthController(authService)
    const authRouter = new AuthRouter(router, authController)
    authRouter.init()

    const authMiddleware = new AuthMiddleware(configService, logger)
    const mongoDomainRepository = new MongoDomainRepository(db)
    const domainService = new DomainService(mongoDomainRepository)
    const domainController = new DomainControllerImpl(domainService)
    const domainRouter = new DomainRouter(router, domainController, authMiddleware)
    domainRouter.init()

    const axiosInstance = axios.create()
    const axiosHttpClient = new AxiosHttpClient(axiosInstance)

    const dnsCache = new DNSCacheImpl(redis)
    const catchAllVerifier = new CatchAllVerifier(axiosHttpClient)

    const proxyRepository = new MongoProxyRepository(db)
    const proxyService = new ProxyService(proxyRepository)
    const proxyController = new ProxyController(proxyService)
    const proxyRouter = new ProxyRouter(router, proxyController, authMiddleware)
    proxyRouter.init()

    const catchAllCache = new RedisCatchAllCache(redis)
    const connectionLimiter = new RedisConnectionLimiter(redis, logger)
    const smtpClientFactory = new SmtpClientCreatorImpl(connectionLimiter, logger)
    const smtpVerifier = new SMTPVerifier(dnsCache, catchAllCache, proxyService, smtpClientFactory)

    const mongoEmailVerificationRepository = new MongoEmailVerificationRepository(db)
    await mongoEmailVerificationRepository.init()

    const smtpEmailVerifier = new EmailVerifier(smtpVerifier, catchAllVerifier, logger)
    const persistenceEmailVerifierDecorator = new PersistenceEmailVerifierDecorator(
        smtpEmailVerifier,
        mongoEmailVerificationRepository,
    )
    const emailVerificationQueue = new EmailVerificationQueue(new Queue(EMAILS, { connection: redis }))
    const emailVerificationQueueWorker = new EmailVerificationQueueWorker(redis, persistenceEmailVerifierDecorator)
    const emailVerificationService = new EmailVerificationService(
        persistenceEmailVerifierDecorator,
        mongoEmailVerificationRepository,
        emailVerificationQueue,
    )
    const emailVerificationController = new ExpressEmailVerificationController(emailVerificationService)
    const emailVerificationRouter = new EmailVerificationRouter(router, emailVerificationController, authMiddleware)
    void emailVerificationQueueWorker.run()
    emailVerificationRouter.init()

    const throwableEmailVerifierDecorator = new ThrowableEmailVerifierDecorator(persistenceEmailVerifierDecorator)
    const findLeadEmailVerificationService = new EmailVerificationService(
        throwableEmailVerifierDecorator,
        mongoEmailVerificationRepository,
        emailVerificationQueue,
    )
    const leadFinder = new LeadFinder(findLeadEmailVerificationService, logger)
    const leadQueue = new LeadQueue(redis)
    const leadQueueWorker = new LeadQueueWorker(redis, leadFinder)
    const leadService = new LeadService(leadFinder, leadQueue)
    const leadController = new LeadController(leadService)
    const leadRouter = new LeadRouter(router, leadController, authMiddleware)
    void leadQueueWorker.run()
    leadRouter.init()

    const swagger = createDocument({
        openapi: '3.1.0',
        info: {
            title: 'Lead Email Finder',
            version: '0.3.0',
        },
        servers: [
            {
                url: 'http://localhost:3000/api/v0',
            },
        ],
        tags: [emailTag, leadTag],
        paths: {
            ...emailPaths,
            ...leadPaths,
        },
    })

    const port = configService.get('PORT')
    const server = express()
        .disable('x-powered-by')
        .use(pinoLoggingMiddleware)
        .use(express.json())
        .use('/swagger', serve, setup(swagger))
        .use(API_PREFIX, router)
        .use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
            ok(err instanceof Error)
            logger.error(`The error has occurred: ${err}`)
            res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).json({ message: 'Something went wrong' })
        })
        .listen(port, () => {
            logger.info(`Server is running on port ${port}`)
        })

    const onTerminationSignal = (): void => {
        server.close(err => {
            if (err !== undefined) {
                logger.error(`Server closed with error: ${err}`)
            } else {
                logger.info(`Shutting down the server gracefully`)
            }
        })

        const onSuccessfulClose =
            (name: string): (() => void) =>
            (): void => {
                logger.info(`${name} connection closed`)
            }

        const onUnsuccessfulClose =
            (name: string): ((reason: unknown) => void) =>
            (reason): void => {
                const errorMessage = `Failed to close ${name} connection`

                if (isNativeError(reason)) {
                    logger.error(`${errorMessage}: ${reason}`)
                } else {
                    logger.error(errorMessage)
                }
            }

        mongoClient.close().then(onSuccessfulClose('MongoDB'), onUnsuccessfulClose('MongoDB'))
        redis.quit().then(onSuccessfulClose('Redis'), onUnsuccessfulClose('Redis'))
    }

    process.on('SIGINT', onTerminationSignal)
    process.on('SIGTERM', onTerminationSignal)
}

main().then(
    () => {
        console.debug('The app is up and running')
    },
    (reason: unknown) => {
        if (isNativeError(reason)) {
            console.error(`The main function exited with error: ${reason}`)
        }

        process.exit(EXIT_FAILURE)
    },
)
