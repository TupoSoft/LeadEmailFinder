import type { MxRecord } from 'node:dns'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

@Schema({ timestamps: true })
export class Domain {
    @Prop()
    _id: string

    @Prop()
    catchAllEnabled?: boolean

    @Prop()
    isFree?: boolean

    @Prop()
    isDisposable?: boolean

    @Prop()
    isVerificationForbidden?: boolean

    @Prop()
    mxRecords?: MxRecord[]

    createdAt: Date

    updatedAt: Date
}

export const DomainSchema = SchemaFactory.createForClass(Domain)
