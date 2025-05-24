import { Expose } from 'class-transformer'
import { IProxy } from '../../../../common'
import { ProxyType } from './proxy-type.enum'

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
