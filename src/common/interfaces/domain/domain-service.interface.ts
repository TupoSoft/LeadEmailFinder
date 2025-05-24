import { IDomainResponseDto } from './domain-response-dto.interface'

export interface IDomainService {
    getDomain(name: string): Promise<IDomainResponseDto>
}
