import type { MxRecord } from 'node:dns'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { AutoMap } from '@automapper/classes'

@Schema({ timestamps: true })
export class Domain {
    @AutoMap()
    @Prop()
    _id: string

    @AutoMap()
    @Prop({ default: null, type: Boolean })
    catchAllEnabled: boolean | null

    @AutoMap()
    @Prop({ default: false })
    isFree: boolean

    @AutoMap()
    @Prop({ default: false })
    isDisposable: boolean

    @AutoMap()
    @Prop({ default: false })
    isVerificationForbidden: boolean

    @AutoMap()
    @Prop()
    mxRecords?: MxRecord[]

    @AutoMap()
    createdAt: Date

    @AutoMap()
    updatedAt: Date
}

export const DomainSchema = SchemaFactory.createForClass(Domain)
