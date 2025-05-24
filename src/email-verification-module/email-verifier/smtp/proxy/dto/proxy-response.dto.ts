import { Expose } from 'class-transformer'
import { ProxyType } from '../enums'
import { IProxy } from '../../../../../common'

export class ProxyResponse implements IProxy {
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
