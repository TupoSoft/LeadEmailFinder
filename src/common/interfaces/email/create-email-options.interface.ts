import { EmailPatternEnum } from '../../enums'

export interface ICreateEmailOptions {
    email: string
    exists: boolean | null
    format?: EmailPatternEnum
}
