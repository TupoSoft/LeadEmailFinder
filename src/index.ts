import express, { type NextFunction, type Request, type Response, Router } from 'express'
import { dbFactory } from './util/mongo'
import {
    CatchAllVerifier,
    EmailVerificationControllerImpl,
    EmailVerificationRouter,
    EmailVerificationService,
    MongoEmailVerificationRepository,
    RedisCatchAllCache,
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
import { SmtpClientFactoryImpl } from './smtp/client-factory'
import { DEFAULT_PORT, EXIT_FAILURE, EXIT_SUCCESS } from './common/constants'
import { getRedis } from './util/redis'
import { isNativeError } from 'node:util/types'

const { env } = process
const { PORT = DEFAULT_PORT } = env

async function main(): Promise<void> {
    const pino = pinoFactory({
        level: 'debug',
    })
    const logger = new PinoLogger(pino)
    const pinoLoggingMiddleware = pinoHttp({
        logger: pino,
    })

    const router = Router()
    router.use(log)

    const db = await dbFactory()

    const redis = await getRedis()

    const mongoDomainRepository = new MongoDomainRepository(db)
    const domainService = new DomainService(mongoDomainRepository)
    const domainController = new DomainControllerImpl(domainService)
    const domainRouter = new DomainRouter(router, domainController)
    domainRouter.init()

    const axiosInstance = axios.create({
        timeout: 10000,
    })

    const dnsCache = new DNSCacheImpl(redis)
    const axiosHttpClient = new AxiosHttpClient(axiosInstance)
    const catchAllVerifier = new CatchAllVerifier(axiosHttpClient)

    const proxyRepository = new MongoProxyRepository(db)
    const proxyService = new ProxyService(proxyRepository)
    const proxyController = new ProxyController(proxyService)
    const proxyRouter = new ProxyRouter(router, proxyController)
    proxyRouter.init()

    const catchAllCache = new RedisCatchAllCache(redis)
    const connectionLimiter = new RedisConnectionLimiter(redis, logger)
    const smtpClientFactory = new SmtpClientFactoryImpl(connectionLimiter, logger)
    const smtpVerifier = new SMTPVerifier(dnsCache, catchAllCache, proxyService, smtpClientFactory)
    const mongoEmailVerificationRepository = new MongoEmailVerificationRepository(db)
    const emailVerificationService = new EmailVerificationService(
        mongoEmailVerificationRepository,
        catchAllVerifier,
        smtpVerifier,
    )

    const emailVerificationController = new EmailVerificationControllerImpl(emailVerificationService)
    const emailVerificationRouter = new EmailVerificationRouter(router, emailVerificationController)
    emailVerificationRouter.init()

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
                logger.error(`Shutting down the server gracefully`)
            }
        })
    }

    process.on('SIGINT', onTerminationSignal)
    process.on('SIGTERM', onTerminationSignal)
}

main().then(
    () => process.exit(EXIT_SUCCESS),
    (reason: unknown) => {
        if (isNativeError(reason)) {
            console.error(`The main function exited with error: ${reason}`)
        }

        process.exit(EXIT_FAILURE)
    },
)
