import type { NextFunction, Request, Response } from 'express'
import type { CreateEmailRequest, GetEmailsRequestQueryParams, UpdateEmailRequest } from './dto'
import { constants } from 'node:http2'
import type { EmailRepository } from './repository'
import type { Logger } from '../logging'
import { HttpError } from '../common'

export class EmailController {
    constructor(
        private readonly repository: EmailRepository,
        private readonly logger: Logger,
    ) {}

    createEmail = (req: Request<unknown, unknown, CreateEmailRequest>, res: Response, next: NextFunction): void => {
        const { body: createEmailDto } = req
        const [username, domain] = createEmailDto.email.split('@')

        this.repository
            .save({
                ...createEmailDto,
                username,
                domain,
            })
            .then(
                record => res.status(constants.HTTP_STATUS_CREATED).json(record),
                (error: unknown) => {
                    this.onError(error, next)
                },
            )
    }

    getEmails = (
        req: Request<unknown, unknown, unknown, GetEmailsRequestQueryParams>,
        res: Response,
        next: NextFunction,
    ): void => {
        this.repository.findAll(req.query).then(
            records => res.status(constants.HTTP_STATUS_OK).json(records),
            (error: unknown) => {
                this.onError(error, next)
            },
        )
    }

    getEmailById = (req: Request, res: Response, next: NextFunction): void => {
        const {
            params: { email },
        } = req

        this.repository.findById(email).then(
            record => {
                if (record == null) {
                    next(HttpError.NotFound(`Email ${email} not found`))
                    return
                }

                res.status(constants.HTTP_STATUS_OK).json(record)
            },
            (error: unknown) => {
                this.onError(error, next)
            },
        )
    }

    updateEmail = (
        req: Request<
            {
                email: string
            },
            unknown,
            UpdateEmailRequest
        >,
        res: Response,
        next: NextFunction,
    ): void => {
        const {
            params: { email },
            body: updateEmailDto,
        } = req

        this.repository.update(email, updateEmailDto).then(
            updatedEmail => {
                if (updatedEmail == null) {
                    next(HttpError.NotFound(`Email ${email} not found`))
                    return
                }

                res.status(constants.HTTP_STATUS_OK).json(updatedEmail)
            },
            (error: unknown) => {
                this.onError(error, next)
            },
        )
    }

    private onError(error: unknown, next: NextFunction): void {
        if (error instanceof Error) {
            this.logger.error(`Error creating email: ${error.message}`)

            const { message } = error
            if (message.includes('already exists')) {
                next(HttpError.Conflict(message))
                return
            }
        }

        next(HttpError.InternalServerError())
    }
}
