import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { ProxyType } from './enums'
import { ObjectId, Types } from 'mongoose'

@Schema()
export class Proxy {
    @Prop({ type: Types.ObjectId })
    _id: ObjectId

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
