import express, { type NextFunction, type Request, type Response, Router } from 'express'
import { getMongoClient } from './util/mongo'
import {
    CatchAllVerifier,
    EmailVerificationRouter,
    EmailVerificationService,
    ExpressEmailVerificationController,
    MongoEmailVerificationRepository,
    RedisCatchAllCache,
    SmtpEmailVerifier,
} from './email-verification'
import axios from 'axios'
import { AxiosHttpClient } from './http-client'
import { DomainControllerImpl, DomainRouter, DomainService, MongoDomainRepository } from './domain'
import { constants as httpConstants } from 'http2'
import { SMTPVerifier } from './smtp'
import { DNSCacheImpl } from './dns'
import { log } from './middleware'
import { FindLeadControllerImpl, FindLeadRouter, FindLeadService } from './find-lead'
import { ProxyService } from './proxy'
import { MongoProxyRepository } from './proxy/mongo-repository'
import { RedisConnectionLimiter } from './smtp/connection-limiter'
import { ProxyController } from './proxy/controller'
import { ProxyRouter } from './proxy/router'
import pinoFactory from 'pino'
import pinoHttp from 'pino-http'
import { PinoLogger } from './logging'
import { ok } from 'node:assert'
import { SmtpClientCreatorImpl } from './smtp/client-creator'
import { DEFAULT_PORT, EXIT_FAILURE } from './common/constants'
import { getRedis } from './util/redis'
import { isNativeError } from 'node:util/types'
import {
    CatchAllEmailVerifierDecorator,
    PersistenceEmailVerifierDecorator,
    ThrowableEmailVerifierDecorator,
} from './email-verification/verifier-decorators'

const { env } = process
const { PORT = DEFAULT_PORT, NODE_ENV } = env

async function main(): Promise<void> {
    const pino = pinoFactory({
        level: NODE_ENV === 'development' ? 'debug' : 'info',
    })

    const logger = new PinoLogger(pino)
    const pinoLoggingMiddleware = pinoHttp({
        logger: pino,
    })

    const router = Router()
    router.use(log)

    const mongoClient = await getMongoClient()
    const db = mongoClient.db()

    const redis = await getRedis()

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

    const smtpEmailVerifier = new SmtpEmailVerifier(smtpVerifier, logger)
    const catchAllEmailVerifierDecorator = new CatchAllEmailVerifierDecorator(
        smtpEmailVerifier,
        catchAllVerifier,
        logger,
    )
    const persistenceEmailVerifierDecorator = new PersistenceEmailVerifierDecorator(
        catchAllEmailVerifierDecorator,
        mongoEmailVerificationRepository,
    )
    const emailVerificationController = new ExpressEmailVerificationController(persistenceEmailVerifierDecorator)
    const emailVerificationRouter = new EmailVerificationRouter(router, emailVerificationController)
    emailVerificationRouter.init()

    const throwableEmailVerifierDecorator = new ThrowableEmailVerifierDecorator(persistenceEmailVerifierDecorator)
    const emailVerificationService = new EmailVerificationService(
        throwableEmailVerifierDecorator,
        mongoEmailVerificationRepository,
    )
    const findLeadService = new FindLeadService(emailVerificationService, logger)
    const findLeadController = new FindLeadControllerImpl(findLeadService)
    const findLeadRouter = new FindLeadRouter(router, findLeadController)
    findLeadRouter.init()

    const server = express()
        .disable('x-powered-by')
        .use(pinoLoggingMiddleware)
        .use(express.json())
        .use(router)
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
