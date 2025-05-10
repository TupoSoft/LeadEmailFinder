import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { ProxyType } from './enums'

@Schema()
export class Proxy {
    @Prop()
    _id: string

    @Prop({ enum: ProxyType })
    type: ProxyType

    @Prop()
    host: string

    @Prop()
    port: number

    @Prop()
    user?: string

    @Prop()
    password?: string

    @Prop()
    blacklists?: string[]
}

export const ProxySchema = SchemaFactory.createForClass(Proxy)
