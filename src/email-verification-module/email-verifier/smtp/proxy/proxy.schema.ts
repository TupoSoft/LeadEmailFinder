import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { ProxyType } from './proxy-type.enum'
import { AutoMap } from '@automapper/classes'

@Schema({ collection: 'proxies' })
export class Proxy {
    @AutoMap()
    @Prop({ type: String, enum: ProxyType })
    type: ProxyType

    @AutoMap()
    @Prop()
    host: string

    @AutoMap()
    @Prop()
    port: number

    @AutoMap()
    @Prop()
    user?: string

    @AutoMap()
    @Prop()
    password?: string

    @AutoMap()
    @Prop()
    blacklists?: string[]
}

export const ProxySchema = SchemaFactory.createForClass(Proxy)
