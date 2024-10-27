import express, { type NextFunction, type Request, type Response, Router } from 'express'
import { mongoConnect, mongooseConnect } from './database-util'
import { EmailVerificationRouter } from './email-verification-router'
import defaultProxyRotator from './util/proxy'
import { getProxiesFromFile, ProxyRepositoryImpl } from './proxy'
import axios from 'axios'
import { ProxySocketConnector } from './socket-connector'
import { SMTPClientFactoryImpl } from './smtp'
import { CatchAllVerifier } from './catch-all'
import { EmailVerificationControllerImpl } from './email-verification-controller'
import { AxiosHttpClient } from './http-client'
import { EmailVerificationService } from './email-verification-service'
import { MongoDomainRepository } from './domain-repository'
import { MongooseEmailVerificationRepository } from './email-verification-repository'
import { constants as httpConstants } from 'http2'
import { DomainService } from './domain-service'
import { DomainControllerImpl } from './domain-controller'
import { DomainRouter } from './domain-router'

const { PORT } = process.env

const port = PORT ?? 3000

async function main(): Promise<void> {
    const router = Router()
    const db = await mongoConnect()

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

    const axiosHttpClient = new AxiosHttpClient(axiosInstance)
    const proxySocketConnector = new ProxySocketConnector(proxyRotator.getRandomProxy())
    const smtpClientFactory = new SMTPClientFactoryImpl(proxySocketConnector)
    const catchAllVerifier = new CatchAllVerifier(axiosHttpClient)

    const mongooseEmailVerificationRepository = new MongooseEmailVerificationRepository()
    const emailVerificationService = new EmailVerificationService(
        mongooseEmailVerificationRepository,
        catchAllVerifier,
        smtpClientFactory,
        mongoDomainRepository,
    )
    const emailVerificationController = new EmailVerificationControllerImpl(emailVerificationService)
    const emailVerificationRouter = new EmailVerificationRouter(router, emailVerificationController)
    emailVerificationRouter.init()

    await mongooseConnect()
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
