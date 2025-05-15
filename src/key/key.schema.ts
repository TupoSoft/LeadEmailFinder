import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

export type KeyDocument = Key & Document

export enum KeyRole {
    READ = 'read',
    WRITE = 'write',
    ADMIN = 'admin',
}

@Schema({ timestamps: true })
export class Key {
    @Prop({ required: true, unique: true, index: true })
    token: string

    @Prop({ required: true, enum: KeyRole, default: [KeyRole.READ], type: [String] })
    permissions: KeyRole[]

    @Prop({ required: true, default: false })
    revoked: boolean

    @Prop({ required: false })
    description: string

    @Prop({ required: true, default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) })
    expiresAt: Date
}

export const KeySchema = SchemaFactory.createForClass(Key)
