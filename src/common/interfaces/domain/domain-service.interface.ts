import { DomainResponseDto } from '../../../domain-module/dto'

export interface IDomainService {
    getDomain(name: string): Promise<DomainResponseDto>
}
