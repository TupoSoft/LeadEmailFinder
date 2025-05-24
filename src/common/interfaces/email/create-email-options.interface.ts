import { EmailPatternEnum } from '../../enums'

export interface ICreateEmailRequestDto {
    email: string
    exists: boolean | null
    format?: EmailPatternEnum
}
