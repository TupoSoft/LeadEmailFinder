import express from 'express'
import { mongooseConnect } from './mongoose'
import { EmailVerificationRouter } from './email-verification-router'
import { MongooseEmailVerificationRepository } from './repositories/mongoose-email-verification-repository'
import defaultProxyRotator from './util/proxy'
import { getProxiesFromFile, ProxyRepositoryImpl } from './proxy'
import axios from 'axios'
import { ProxySocketConnector } from './socket-connector'
import { SMTPClientFactoryImpl } from './smtp'
import { CatchAllVerifier } from './catch-all'
import { EmailVerificationControllerImpl } from './email-verification-controller'
import { AxiosHttpClient } from './http-client'
import { EmailVerificationService } from './email-verification-service'

const { PORT } = process.env

const port = PORT ?? 3000

async function main(): Promise<void> {
    const mongooseEmailVerificationRepository = new MongooseEmailVerificationRepository()
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
    const emailVerificationService = new EmailVerificationService(
        mongooseEmailVerificationRepository,
        catchAllVerifier,
        smtpClientFactory,
    )
    const emailVerificationController = new EmailVerificationControllerImpl(emailVerificationService)
    const emailVerificationRouter = new EmailVerificationRouter(emailVerificationController)

    await mongooseConnect()
    express()
        .disable('x-powered-by')
        .use(express.json())
        .use(emailVerificationRouter.routes)
        .listen(port, () => {
            console.log(`Server is running on port ${port}`)
        })
}

void main()
