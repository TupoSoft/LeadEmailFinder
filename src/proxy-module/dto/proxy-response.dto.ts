import { Expose } from 'class-transformer'
import { ProxyType } from '../enums'

export class ProxyResponse {
    @Expose()
    id: string

    @Expose()
    type: ProxyType

    @Expose()
    host: string

    @Expose()
    port: number

    @Expose()
    user?: string

    @Expose()
    blacklists?: string[]
}
