import express, {Request, Response} from "express";
import {constants as httpConstants} from "http2";
import {EmailVerifier, SMTPVerificationError} from "./email-verifier";
import {LeadEmailFinder} from "./lead-email-finder";
import authenticate from "./authenticate";

const app = express()
const port = process.env.PORT || 3000
const emailVerifier = new EmailVerifier()
const leadEmailFinder = new LeadEmailFinder()

app.disable('x-powered-by').get('/verify', authenticate, async (req: Request, res: Response) => {
    const email = req.query.email as string
    const verificationData = await emailVerifier.verify(email)

    if (verificationData.error === SMTPVerificationError.InvalidEmailFormat
    ) {
        res.status(httpConstants.HTTP_STATUS_BAD_REQUEST)
    }

    res.json(verificationData)
}).get('/findLead', authenticate, async (req: Request, res: Response) => {
    const {firstName, lastName, domain} = req.query as { [key: string]: string }
    const findLeadData = await leadEmailFinder.findLead({
        firstName, lastName, domain
    })
    res.json(findLeadData)
}).get('/ping', (_, res: Response) => {
    const foo = 'bar'
    res.status(httpConstants.HTTP_STATUS_OK).json({reply: 'PONG'})
}).get('/', (_: Request, res: Response) => {
    res.send('Hello World!')
}).listen(port, () => {
    console.log(`Server is running on port ${port}`);
})
