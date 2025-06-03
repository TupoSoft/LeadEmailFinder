import { Expose } from 'class-transformer'
import { IProxy } from '../../../../common'
import { ProxyType } from './proxy-type.enum'
import { AutoMap } from '@automapper/classes'

export class ProxyResponse implements IProxy {
    @AutoMap()
    @Expose()
    id: string

    @AutoMap()
    @Expose()
    type: ProxyType

    @AutoMap()
    @Expose()
    host: string

    @AutoMap()
    @Expose()
    port: number

    @AutoMap()
    @Expose()
    user?: string

    @AutoMap()
    @Expose()
    password?: string

    @AutoMap()
    @Expose()
    blacklists?: string[]
}
