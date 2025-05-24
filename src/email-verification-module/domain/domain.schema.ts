import type { MxRecord } from 'node:dns'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

@Schema({ timestamps: true })
export class Domain {
    @Prop()
    _id: string

    @Prop({ default: null, type: Boolean })
    catchAllEnabled: boolean | null

    @Prop({ default: false })
    isFree: boolean

    @Prop({ default: false })
    isDisposable: boolean

    @Prop({ default: false })
    isVerificationForbidden: boolean

    @Prop()
    mxRecords?: MxRecord[]

    createdAt: Date

    updatedAt: Date
}

export const DomainSchema = SchemaFactory.createForClass(Domain)
