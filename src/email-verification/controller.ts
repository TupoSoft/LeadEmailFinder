import type { NextFunction, Request, Response } from 'express'

export interface EmailVerificationController {
    verifyEmail: (req: Request, res: Response, next: NextFunction) => void
    verifyEmailOld: (req: Request, res: Response, next: NextFunction) => void
    verifyEmails: (req: Request, res: Response, next: NextFunction) => void
    getVerifyBulkStatus: (req: Request, res: Response, next: NextFunction) => void
    getVerifyBulkResults: (req: Request, res: Response, next: NextFunction) => void
}
