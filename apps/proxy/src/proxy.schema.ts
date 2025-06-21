import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Protocol } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { AutoMap } from '@automapper/classes'
import { Types } from 'mongoose'

@Schema({ _id: false })
export class Auth {
    @Prop()
    @AutoMap()
    user: string

    @Prop()
    @AutoMap()
    pass: string
}

@Schema({ timestamps: true })
export class Proxy {
    @AutoMap()
    _id: Types.ObjectId

    @Prop({ type: Number, enum: Protocol })
    @AutoMap()
    protocol: Protocol

    @Prop()
    @AutoMap()
    host: string

    @Prop()
    @AutoMap()
    port: number

    @Prop()
    @AutoMap(() => Auth)
    auth: Auth

    @Prop({ default: 1 })
    @AutoMap()
    weight: number

    @Prop()
    @AutoMap()
    description?: string

    @Prop({ default: true })
    @AutoMap()
    enabled: boolean

    @AutoMap()
    createdAt: Date

    @AutoMap()
    updatedAt: Date
}

export const ProxySchema = SchemaFactory.createForClass(Proxy)
