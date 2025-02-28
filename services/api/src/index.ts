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
import { DomainControllerImpl, DomainRouter, DomainService, MongoDomainRepository } from './domain'
import { RedisCatchAllCache, RedisConnectionLimiter, SmtpClientCreatorImpl, SMTPVerifier } from './smtp'
import { DNSCacheImpl } from './dns'
import { LeadController, LeadFinder, LeadQueue, LeadRouter } from './lead'
import { MongoProxyRepository, ProxyService } from './proxy'
import { ProxyController } from './proxy/controller'
import { ProxyRouter } from './proxy/router'
import { ConfigService, type Environment, EXIT_FAILURE, parseEnv } from './common'
import { RedisCreator } from './util/redis'
import { isNativeError } from 'node:util/types'
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
import { ErrorMiddleware } from './middleware/handle-error'
import { createDocument } from 'zod-openapi'
import { leadPaths, leadTag } from './lead/openapi'
import { serve, setup } from 'swagger-ui-express'
import { emailVerificationPaths, verificationTag } from './email-verification/openapi'
import { legacyVerifyEmailPaths, verifyTag } from './email-verification/legacy/openapi'
import { loggingMiddleware, PinoLogger } from 'logging'
import express, { type NextFunction, type Request, type Response, Router } from 'express'
import { LinkedInLogin, MicrosoftGetCredentialType, MicrosoftLogin, OfficeApps } from './email-verification/http'
import { randomUUID } from 'node:crypto'
import { EmailModule } from './email'
import { emailApiPaths } from './email/openapi'

declare module 'express' {
    interface Request {
        swaggerDoc?: object
    }
}

interface LoggerMixin {
    correlationId: string
}

async function main(): Promise<void> {
    const environment = await parseEnv()
    const configService = new ConfigService<Environment>(environment)

    const loggerMixin: LoggerMixin = {
        correlationId: '',
    }

    const logger = new PinoLogger({
        options: {
            level: configService.get('NODE_ENV') !== 'production' ? 'debug' : 'info',
            mixin: () => ({
                ...loggerMixin,
            }),
        },
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

    const emailModule = new EmailModule(db, logger, router, authMiddleware)
    await emailModule.init()

    const microsoftLogin = new MicrosoftLogin(axiosHttpClient)
    const microsoftGetCreds = new MicrosoftGetCredentialType(axiosHttpClient)
    const officeApps = new OfficeApps(axiosHttpClient)
    const linkedinLogin = new LinkedInLogin(axiosHttpClient)
    const emailVerificationRunner = new EmailVerificationRunner(
        smtpVerifier,
        [microsoftGetCreds, microsoftLogin, officeApps, linkedinLogin],
        logger,
    )
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
            (_req: Request, _res: Response, next: NextFunction): void => {
                loggerMixin.correlationId = randomUUID()
                next()
            },
            loggingMiddleware(
                {
                    level: configService.get('NODE_ENV') !== 'production' ? 'debug' : 'info',
                },
                {
                    genReqId: (_req, _res) => loggerMixin.correlationId,
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
