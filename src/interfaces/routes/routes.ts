import { type Request, type Response, Router } from 'express'
import { MongooseEmailVerificationRepository } from '../../infrastructure/repositories/MongooseEmailVerificationRepository'
import defaultProxyRotator from '../../util/proxy'
import { EmailVerificationController } from '../controllers/EmailVerificationController'
import { authenticate, log, validate } from '../middleware'
import { query } from 'express-validator'
import { VerifyEmail } from '../../application/use-cases'
import { CatchAllVerifier } from '../../application/use-cases/verify-email/CatchAllVerifier'
import { AxiosHttpClient } from '../../infrastructure/AxiosHttpClient'
import axios from 'axios'

const router: Router = Router()

const emailVerificationRepository = new MongooseEmailVerificationRepository()
const proxyRotator = defaultProxyRotator
const httpClient = new AxiosHttpClient(
    axios.create({
        proxy: {
            auth: {
                username: 'lum-customer-c_7ac16cb1-zone-salesar_simple_links',
                password: '28gpq8rxnx1m',
            },
            host: 'zproxy.lum-superproxy.io',
            port: 22225,
            protocol: 'http',
        },
        timeout: 30000,
    }),
)
const catchAllVerifier = new CatchAllVerifier(httpClient)
const verifyEmail = new VerifyEmail(emailVerificationRepository, proxyRotator, catchAllVerifier)
const emailVerificationController = new EmailVerificationController(verifyEmail)

router.get(
    '/verify',
    authenticate,
    log,
    validate(query('email').isEmail().notEmpty().escape()),
    (req: Request, res: Response) => {
        void emailVerificationController.verify(req, res)
    },
)

router.get('/ping', log, (_, res: Response) => {
    res.send('PONG')
})

router.get('/', log, (_: Request, res: Response) => {
    res.send('Hello World!')
})

export default router
