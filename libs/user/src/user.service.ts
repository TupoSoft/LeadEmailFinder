import { Injectable, ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { User, UserDocument } from './user.schema'
import { CreateUserDto, UpdateUserDto, LoginDto } from './user.dto'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        private jwtService: JwtService,
        private configService: ConfigService,
    ) {}

    async create(createUserDto: CreateUserDto): Promise<UserDocument> {
        const existingUser = await this.userModel.findOne({ email: createUserDto.email })
        if (existingUser) {
            throw new ConflictException('User with this email already exists')
        }

        const user = new this.userModel(createUserDto)
        return user.save()
    }

    async findAll(): Promise<UserDocument[]> {
        return this.userModel.find().exec()
    }

    async findById(id: string): Promise<UserDocument> {
        if (!Types.ObjectId.isValid(id)) {
            throw new NotFoundException('Invalid user ID')
        }

        const user = await this.userModel.findById(id).exec()
        if (!user) {
            throw new NotFoundException('User not found')
        }
        return user
    }

    async findByEmail(email: string): Promise<UserDocument | null> {
        return this.userModel.findOne({ email }).exec()
    }

    async update(id: string, updateUserDto: UpdateUserDto): Promise<UserDocument> {
        if (!Types.ObjectId.isValid(id)) {
            throw new NotFoundException('Invalid user ID')
        }

        if (updateUserDto.password) {
            const salt = await bcrypt.genSalt(10)
            updateUserDto.password = await bcrypt.hash(updateUserDto.password, salt)
        }

        const user = await this.userModel.findByIdAndUpdate(id, updateUserDto, { new: true }).exec()

        if (!user) {
            throw new NotFoundException('User not found')
        }
        return user
    }

    async delete(id: string): Promise<void> {
        if (!Types.ObjectId.isValid(id)) {
            throw new NotFoundException('Invalid user ID')
        }

        const result = await this.userModel.deleteOne({ _id: id }).exec()
        if (result.deletedCount === 0) {
            throw new NotFoundException('User not found')
        }
    }

    async login(loginDto: LoginDto) {
        const user = await this.findByEmail(loginDto.email)
        if (!user || !(await user.validatePassword(loginDto.password))) {
            throw new UnauthorizedException('Invalid credentials')
        }

        if (!user.isActive) {
            throw new UnauthorizedException('User account is deactivated')
        }

        const payload = { email: user.email, sub: user._id.toString() }
        const accessToken = this.jwtService.sign(payload)
        const refreshToken = this.jwtService.sign(payload, {
            expiresIn: '7d',
            secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'your-refresh-secret'),
        })

        // Store refresh token
        user.refreshTokens.push(refreshToken)
        await user.save()

        return {
            user,
            accessToken,
            refreshToken,
        }
    }

    async refreshToken(refreshToken: string) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'your-refresh-secret'),
            })

            const user = await this.findById(payload.sub)
            if (!user || !user.refreshTokens.includes(refreshToken)) {
                throw new UnauthorizedException('Invalid refresh token')
            }

            const newPayload = { email: user.email, sub: user._id.toString() }
            const accessToken = this.jwtService.sign(newPayload)
            const newRefreshToken = this.jwtService.sign(newPayload, {
                expiresIn: '7d',
                secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'your-refresh-secret'),
            })

            // Replace old refresh token with new one
            user.refreshTokens = user.refreshTokens.filter(token => token !== refreshToken)
            user.refreshTokens.push(newRefreshToken)
            await user.save()

            return {
                user,
                accessToken,
                refreshToken: newRefreshToken,
            }
        } catch (error) {
            throw new UnauthorizedException('Invalid refresh token')
        }
    }

    async logout(userId: string, refreshToken: string): Promise<void> {
        const user = await this.findById(userId)
        user.refreshTokens = user.refreshTokens.filter(token => token !== refreshToken)
        await user.save()
    }
}
