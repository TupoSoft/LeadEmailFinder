import { DomainResponseDto } from '../../../email-verification-module/domain/dto'

export interface IDomainService {
    getDomain(name: string): Promise<DomainResponseDto>
}
