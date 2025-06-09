import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    Request,
    HttpCode,
    HttpStatus,
} from '@nestjs/common'
import { UserService } from './user.service'
import { CreateUserDto, UpdateUserDto, LoginDto, RefreshTokenDto, UserResponseDto, AuthResponseDto } from './user.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Public } from '../auth/decorators/public.decorator'
import { plainToInstance } from 'class-transformer'

@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Public()
    @Post('register')
    async register(@Body() createUserDto: CreateUserDto) {
        const user = await this.userService.create(createUserDto)
        return plainToInstance(UserResponseDto, user.toObject())
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() loginDto: LoginDto) {
        const result = await this.userService.login(loginDto)
        return plainToInstance(AuthResponseDto, {
            user: result.user.toObject(),
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
        })
    }

    @Public()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
        const result = await this.userService.refreshToken(refreshTokenDto.refreshToken)
        return plainToInstance(AuthResponseDto, {
            user: result.user.toObject(),
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
        })
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@Request() req, @Body() refreshTokenDto: RefreshTokenDto) {
        await this.userService.logout(req.user._id.toString(), refreshTokenDto.refreshToken)
        return { message: 'Logged out successfully' }
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    async getProfile(@Request() req) {
        return plainToInstance(UserResponseDto, req.user.toObject())
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    async findAll() {
        const users = await this.userService.findAll()
        return users.map(user => plainToInstance(UserResponseDto, user.toObject()))
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id')
    async findOne(@Param('id') id: string) {
        const user = await this.userService.findById(id)
        return plainToInstance(UserResponseDto, user.toObject())
    }

    @UseGuards(JwtAuthGuard)
    @Patch(':id')
    async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req) {
        // Users can only update their own profile unless they're admin
        if (req.user._id.toString() !== id && !req.user.isAdmin) {
            throw new UnauthorizedException('You can only update your own profile')
        }

        const user = await this.userService.update(id, updateUserDto)
        return plainToInstance(UserResponseDto, user.toObject())
    }

    @UseGuards(JwtAuthGuard)
    @Delete(':id')
    async remove(@Param('id') id: string, @Request() req) {
        // Users can only delete their own account unless they're admin
        if (req.user._id.toString() !== id && !req.user.isAdmin) {
            throw new UnauthorizedException('You can only delete your own account')
        }

        await this.userService.delete(id)
        return { message: 'User deleted successfully' }
    }
}
