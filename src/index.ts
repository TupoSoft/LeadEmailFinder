import express, { type NextFunction, type Request, type Response, Router } from 'express'
import { dbFactory } from './database-util'
import {
    EmailVerificationControllerImpl,
    EmailVerificationRouter,
    EmailVerificationService,
    MongoEmailVerificationRepository,
    RedisCatchAllCache,
} from './email-verification'
import defaultProxyRotator from './util/proxy'
import { getProxiesFromFile, ProxyRepositoryImpl } from './proxy'
import axios from 'axios'
import { ProxySocketConnector } from './socket-connector'
import { CatchAllVerifier } from './email-verification/catch-all-verifier'
import { AxiosHttpClient } from './http-client'
import { MongoDomainRepository } from './domain-repository'
import { constants as httpConstants } from 'http2'
import { DomainService } from './domain-service'
import { DomainControllerImpl } from './domain-controller'
import { DomainRouter } from './domain-router'
import { SMTPClientFactoryImpl, SMTPVerifierImpl } from './smtp'
import { DNSCacheImpl } from './dns'
import { Redis } from 'ioredis'
import { log } from './middleware'

const { PORT } = process.env

const port = PORT ?? 3000

async function main(): Promise<void> {
    const router = Router()
    router.use(log)
    const db = await dbFactory()

    const mongoDomainRepository = new MongoDomainRepository(db)
    const domainService = new DomainService(mongoDomainRepository)
    const domainController = new DomainControllerImpl(domainService)
    const domainRouter = new DomainRouter(router, domainController)
    domainRouter.init()

    const proxyRotator = defaultProxyRotator
    const proxies = await getProxiesFromFile()
    const proxyRepository = new ProxyRepositoryImpl(proxies)
    const axiosInstance = axios.create({
        proxy: proxyRepository.getByName('http'),
        timeout: 30000,
    })

    const redis = new Redis({
        host: 'redis',
    })
    const dnsCache = new DNSCacheImpl(redis)
    const axiosHttpClient = new AxiosHttpClient(axiosInstance)
    const proxySocketConnector = new ProxySocketConnector(proxyRotator.getRandomProxy())
    const smtpClientFactory = new SMTPClientFactoryImpl(proxySocketConnector, dnsCache)
    const catchAllVerifier = new CatchAllVerifier(axiosHttpClient)

    const catchAllCache = new RedisCatchAllCache(redis)
    const smtpVerifier = new SMTPVerifierImpl(smtpClientFactory, dnsCache, catchAllCache)
    const mongoEmailVerificationRepository = new MongoEmailVerificationRepository(db)
    const emailVerificationService = new EmailVerificationService(
        mongoEmailVerificationRepository,
        catchAllVerifier,
        smtpVerifier,
    )
    const emailVerificationController = new EmailVerificationControllerImpl(emailVerificationService)
    const emailVerificationRouter = new EmailVerificationRouter(router, emailVerificationController)
    emailVerificationRouter.init()

    express()
        .disable('x-powered-by')
        .use(express.json())
        .use(router)
        .use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
            console.error('The error has occurred: ', err)
            res.status(httpConstants.HTTP_STATUS_INTERNAL_SERVER_ERROR).send('Something went wrong...')
        })
        .listen(port, () => {
            console.log(`Server is running on port ${port}`)
        })
}

void main()
