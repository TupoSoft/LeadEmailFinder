import { DomainResponseDto } from '../dto'

export interface IDomainService {
    getDomain(name: string): Promise<DomainResponseDto>
}
