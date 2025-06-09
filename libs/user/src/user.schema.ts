import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import * as bcrypt from 'bcrypt'

@Schema({ timestamps: true })
export class User {
    @Prop({ required: true, unique: true, lowercase: true, trim: true })
    email: string

    @Prop({ required: true })
    password: string

    @Prop({ required: true })
    name: string

    @Prop({ default: true })
    isActive: boolean

    @Prop({ default: false })
    isAdmin: boolean

    @Prop({ type: [String], default: [] })
    refreshTokens: string[]

    async validatePassword(password: string): Promise<boolean> {
        return bcrypt.compare(password, this.password)
    }
}

export const UserSchema = SchemaFactory.createForClass(User)

// Hash password before saving
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next()

    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
})

// Add validatePassword method to schema
UserSchema.methods.validatePassword = async function(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password)
}
