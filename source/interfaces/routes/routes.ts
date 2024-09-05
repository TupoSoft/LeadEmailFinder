import { type Request, type Response, Router } from 'express'
import { MongoEmailVerificationRepository } from '../../infrastructure/repositories/MongoEmailVerificationRepository'
import { VerifyEmail } from '../../application/use-cases/VerifyEmail'
import defaultProxyRotator from '../../proxy'
import { EmailVerificationController } from '../controllers/EmailVerificationController'
import { authenticate, log, validate } from '../middleware'
import { query } from 'express-validator'

const router = Router()

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
