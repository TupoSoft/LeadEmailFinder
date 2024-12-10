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
import { Redis } from 'ioredis'
import { log } from './middleware'
import { FindLeadControllerImpl, FindLeadRouter, FindLeadService } from './find-lead'
import { ProxyService } from './proxy'
import { MongoProxyRepository } from './proxy/mongo-repository'
import { RedisConnectionLimiter } from './smtp/connection-limiter'
import { ProxyController } from './proxy/controller'
import { ProxyRouter } from './proxy/router'

const { env } = process
const DEFAULT_PORT = 3000
const { PORT = DEFAULT_PORT } = env

async function main(): Promise<void> {
    const router = Router()
    router.use(log)

    const db = await dbFactory()

    const redis = new Redis({
        host: 'redis',
    })

    const mongoDomainRepository = new MongoDomainRepository(db)
    const domainService = new DomainService(mongoDomainRepository)
    const domainController = new DomainControllerImpl(domainService)
    const domainRouter = new DomainRouter(router, domainController)
    domainRouter.init()

    const axiosInstance = axios.create({})

    const dnsCache = new DNSCacheImpl(redis)
    const axiosHttpClient = new AxiosHttpClient(axiosInstance)
    const catchAllVerifier = new CatchAllVerifier(axiosHttpClient)

    const proxyRepository = new MongoProxyRepository(db)
    const proxyService = new ProxyService(proxyRepository)
    const proxyController = new ProxyController(proxyService)
    const proxyRouter = new ProxyRouter(router, proxyController)
    proxyRouter.init()

    const catchAllCache = new RedisCatchAllCache(redis)
    const connectionLimiter = new RedisConnectionLimiter(redis)
    const smtpVerifier = new SMTPVerifier(dnsCache, catchAllCache, proxyService, connectionLimiter)
    const mongoEmailVerificationRepository = new MongoEmailVerificationRepository(db)
    const emailVerificationService = new EmailVerificationService(
        mongoEmailVerificationRepository,
        catchAllVerifier,
        smtpVerifier,
    )

    const emailVerificationController = new EmailVerificationControllerImpl(emailVerificationService)
    const emailVerificationRouter = new EmailVerificationRouter(router, emailVerificationController)
    emailVerificationRouter.init()

    const findLeadService = new FindLeadService(emailVerificationService, domainService)
    const findLeadController = new FindLeadControllerImpl(findLeadService)
    const findLeadRouter = new FindLeadRouter(router, findLeadController)
    findLeadRouter.init()

    const server = express()
        .disable('x-powered-by')
        .use(express.json())
        .use(router)
        .use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
            console.error('The error has occurred: ', err)
            res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).send('Something went wrong...')
        })
        .listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`)
        })

    const onTerminationSignal = (): void => {
        server.close(err => {
            if (err !== undefined) {
                console.error(`Server closed with error: ${err}`)
            } else {
                console.error(`Server gracefully shutdown`)
            }
        })
    }

    process.on('SIGINT', onTerminationSignal)
    process.on('SIGTERM', onTerminationSignal)
}

void main()
