import { type Request, type Response, Router } from 'express'
import { MongoEmailVerificationRepository } from '../../infrastructure/repositories/MongoEmailVerificationRepository'
import defaultProxyRotator from '../../util/proxy'
import { EmailVerificationController } from '../controllers/EmailVerificationController'
import { authenticate, log, validate } from '../middleware'
import { query } from 'express-validator'
import { VerifyEmail } from '../../application/use-cases'

const router: Router = Router()

const emailVerificationRepository = new MongoEmailVerificationRepository()
const proxyRotator = defaultProxyRotator
const verifyEmail = new VerifyEmail(emailVerificationRepository, proxyRotator)
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
