import express, { type NextFunction, type Request, type Response, Router } from 'express'
import { getMongoClient } from './util/mongo'
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
import { API_PREFIX, EXIT_FAILURE } from './common/constants'
import { getRedis } from './util/redis'
import { isNativeError } from 'node:util/types'
import {
    PersistenceEmailVerifierDecorator,
    ThrowableEmailVerifierDecorator,
} from './email-verification/verifier-decorators'
import { LeadQueueWorker } from './lead/queue-worker'
import { NODE_ENV, PORT } from './common/env'
import { AuthRouter } from './auth/router'
import { AuthController } from './auth/controller'
import { AuthService } from './auth/service'
import { MongoUserRepository, UserService } from './user'

async function main(): Promise<void> {
    const pino = pinoFactory({
        level: NODE_ENV === 'development' ? 'debug' : 'info',
    })

    const logger = new PinoLogger(pino)
    const pinoLoggingMiddleware = pinoHttp({
        logger: pino,
    })

    const router = Router()

    const mongoClient = await getMongoClient()
    const db = mongoClient.db()

    const redis = getRedis()

    const mongoUserRepository = new MongoUserRepository(db)
    const userService = new UserService(mongoUserRepository)
    await mongoUserRepository.createIndices()

    const authService = new AuthService(userService)
    const authController = new AuthController(authService)
    const authRouter = new AuthRouter(router, authController)
    authRouter.init()

    const mongoDomainRepository = new MongoDomainRepository(db)
    const domainService = new DomainService(mongoDomainRepository)
    const domainController = new DomainControllerImpl(domainService)
    const domainRouter = new DomainRouter(router, domainController)
    domainRouter.init()

    const axiosInstance = axios.create()
    const axiosHttpClient = new AxiosHttpClient(axiosInstance)

    const dnsCache = new DNSCacheImpl(redis)
    const catchAllVerifier = new CatchAllVerifier(axiosHttpClient)

    const proxyRepository = new MongoProxyRepository(db)
    const proxyService = new ProxyService(proxyRepository)
    const proxyController = new ProxyController(proxyService)
    const proxyRouter = new ProxyRouter(router, proxyController)
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
    const emailVerificationService = new EmailVerificationService(
        persistenceEmailVerifierDecorator,
        mongoEmailVerificationRepository,
    )
    const emailVerificationController = new ExpressEmailVerificationController(emailVerificationService)
    const emailVerificationRouter = new EmailVerificationRouter(router, emailVerificationController)
    emailVerificationRouter.init()

    const throwableEmailVerifierDecorator = new ThrowableEmailVerifierDecorator(persistenceEmailVerifierDecorator)
    const findLeadEmailVerificationService = new EmailVerificationService(
        throwableEmailVerifierDecorator,
        mongoEmailVerificationRepository,
    )
    const leadFinder = new LeadFinder(findLeadEmailVerificationService, logger)
    const leadQueue = new LeadQueue(redis)
    const leadQueueWorker = new LeadQueueWorker(redis, leadFinder)
    const leadService = new LeadService(leadFinder, leadQueue)
    const leadController = new LeadController(leadService)
    const leadRouter = new LeadRouter(router, leadController)
    void leadQueueWorker.run()
    leadRouter.init()

    const server = express()
        .disable('x-powered-by')
        .use(pinoLoggingMiddleware)
        .use(express.json())
        .use(API_PREFIX, router)
        .use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
            ok(err instanceof Error)
            logger.error(`The error has occurred: ${err}`)
            res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).send('Something went wrong...')
        })
        .listen(PORT, () => {
            logger.info(`Server is running on port ${PORT}`)
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
