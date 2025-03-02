import { MongoClientCreator } from './util/mongo'
import {
    EmailVerificationRouter,
    EmailVerificationRunner,
    EmailVerificationService,
    ExpressEmailVerificationController,
    MongoEmailVerificationRepository,
} from './email-verification'
import axios from 'axios'
import { AxiosHttpClient } from './http-client'
import {
    RedisConnectionLimiter,
    RedisSmtpVerificationResultRepository,
    SmtpClientCreatorImpl,
    SmtpVerifier,
} from './smtp'
import { DNSCacheImpl } from './dns'
import { LeadController, LeadFinder, LeadQueue, LeadRouter } from './lead'
import { MongoProxyRepository } from './proxy'
import { ConfigService, type Environment, EXIT_FAILURE, parseEnv } from './common'
import { RedisCreator } from './util/redis'
import { isNativeError } from 'node:util/types'
import { LeadQueueWorker } from './lead/queue-worker'
import { AuthMiddleware } from './middleware'
import { EmailVerificationQueue } from './email-verification/queue'
import { EmailVerificationQueueWorker } from './email-verification/queue-worker'
import { Queue } from 'bullmq'
import { RESOURCE as EMAILS } from './email-verification/constants'
import { ErrorMiddleware } from './middleware/handle-error'
import { createDocument } from 'zod-openapi'
import { leadPaths, leadTag } from './lead/openapi'
import { serve, setup } from 'swagger-ui-express'
import { emailVerificationPaths, verificationTag } from './email-verification/openapi'
import { legacyVerifyEmailPaths, verifyTag } from './email-verification/legacy/openapi'
import { loggingMiddleware, PinoLogger } from 'logging'
import express, { Router } from 'express'
import { LinkedInLogin, MicrosoftGetCredentialType, MicrosoftLogin, OfficeApps } from './email-verification/http'
import { EmailModule } from './email'
import { emailApiPaths } from './email/openapi'
import { randomUUID } from 'node:crypto'

async function main(): Promise<void> {
    const environment = await parseEnv()
    const configService = new ConfigService<Environment>(environment)

    const logger = new PinoLogger({
        options: {
            level: configService.get('NODE_ENV') !== 'production' ? 'debug' : 'info',
        },
    })

    const router = Router()
    const mongoClientCreator = new MongoClientCreator(configService, logger)
    const mongoClient = await mongoClientCreator.create()
    const db = mongoClient.db()

    const redisCreator = new RedisCreator(configService, logger)
    const redis = redisCreator.create()

    const authMiddleware = new AuthMiddleware(configService, logger)

    const {
        port: proxyPort,
        hostname,
        username,
        password,
        protocol,
    } = new URL(configService.get('CATCH_ALL_HTTP_PROXY_URL'))

    const axiosInstance = axios.create({
        proxy: {
            port: Number(proxyPort),
            host: hostname,
            auth: {
                username,
                password,
            },
            protocol,
        },
    })
    const axiosHttpClient = new AxiosHttpClient(axiosInstance)

    const dnsCache = new DNSCacheImpl(redis)

    const proxyRepository = new MongoProxyRepository(db)
    const redisSmtpVerificationResultCache = new RedisSmtpVerificationResultRepository(redis)
    const connectionLimiter = new RedisConnectionLimiter(redis, logger)
    const smtpClientFactory = new SmtpClientCreatorImpl(logger, connectionLimiter)
    const smtpVerifier = new SmtpVerifier(
        dnsCache,
        proxyRepository,
        smtpClientFactory,
        redisSmtpVerificationResultCache,
    )

    const mongoEmailVerificationRepository = new MongoEmailVerificationRepository(db)
    await mongoEmailVerificationRepository.init()

    const emailModule = new EmailModule(db, logger, router, authMiddleware)
    await emailModule.init()

    const microsoftLogin = new MicrosoftLogin(axiosHttpClient)
    const microsoftGetCreds = new MicrosoftGetCredentialType(axiosHttpClient)
    const officeApps = new OfficeApps(axiosHttpClient)
    const linkedinLogin = new LinkedInLogin(axiosHttpClient)
    const emailVerificationRunner = new EmailVerificationRunner(smtpVerifier, [
        microsoftGetCreds,
        microsoftLogin,
        officeApps,
        linkedinLogin,
    ])
    const emailVerificationQueue = new EmailVerificationQueue(new Queue(EMAILS, { connection: redis }))
    const emailVerificationQueueWorker = new EmailVerificationQueueWorker(redis, emailVerificationRunner)
    const emailVerificationService = new EmailVerificationService(
        emailVerificationRunner,
        mongoEmailVerificationRepository,
        emailModule.repository,
    )
    const emailVerificationController = new ExpressEmailVerificationController(
        emailVerificationService,
        emailVerificationQueue,
    )
    const emailVerificationRouter = new EmailVerificationRouter(router, emailVerificationController, authMiddleware)
    void emailVerificationQueueWorker.run()
    emailVerificationRouter.init()

    const leadFinder = new LeadFinder(emailVerificationService, logger)
    const leadQueue = new LeadQueue(redis)
    const leadQueueWorker = new LeadQueueWorker(redis, leadFinder)
    const leadController = new LeadController(leadFinder, leadQueue)
    const leadRouter = new LeadRouter(router, leadController, authMiddleware)
    void leadQueueWorker.run()
    leadRouter.init()

    const url = configService.get('API_URL')
    const version = configService.get('npm_package_version')
    const swagger = createDocument({
        openapi: '3.1.0',
        info: {
            title: 'Lead Email Finder API',
            contact: {
                email: 'contact@leademailfinder.com',
                name: 'Lead Email Finder Support',
                url,
            },
            version,
        },
        servers: [
            {
                url,
                description: 'Production server',
            },
        ],
        tags: [verificationTag, leadTag, verifyTag, { name: 'emails', description: 'Emails API' }],
        paths: {
            ...emailVerificationPaths,
            ...leadPaths,
            ...legacyVerifyEmailPaths,
            ...emailApiPaths,
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    })

    const errorMiddleware = new ErrorMiddleware(logger)
    const port = configService.get('PORT')
    const server = express()
        .disable('x-powered-by')
        .enable('trust proxy')
        .use(
            loggingMiddleware(
                {
                    level: configService.get('NODE_ENV') !== 'production' ? 'debug' : 'info',
                },
                {
                    genReqId: () => randomUUID(),
                },
            ),
            express.json(),
            router,
            errorMiddleware.handleError.bind(errorMiddleware),
        )
        .use('/', serve)
        .get('/', setup(swagger, { customSiteTitle: 'Lead Email Finder API' }))
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
