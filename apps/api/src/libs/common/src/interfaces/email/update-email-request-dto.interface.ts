import { ICreateEmailRequestDto } from './create-email-options.interface'

export type IUpdateEmailRequestDto = Partial<Pick<ICreateEmailRequestDto, 'format' | 'exists'>> & {
    lastVerificationId?: string
}
