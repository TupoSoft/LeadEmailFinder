import type { Request, Response, Router } from 'express'
// import type { EmailVerificationController } from './controller'
import { body } from 'express-validator'
import { authenticate, log, validate } from '../middleware'

export class EmailScraperRouter {
    constructor(
        private readonly router: Router,
        // private readonly emailVerificationController: EmailVerificationController,
    ) {}

    init(): void {
        this.router.post(
            '/findByName',
            authenticate,
            validate([
                body('name').isString().notEmpty(),
                body('domain').isString().notEmpty(),
            ]),
            null, //
        )

        this.router.get('/ping', log, (_, res: Response) => {
            res.json('PONG')
        })

        this.router.get('/', log, (_: Request, res: Response) => {
            res.json('Hello World!')
        })
    }
}
