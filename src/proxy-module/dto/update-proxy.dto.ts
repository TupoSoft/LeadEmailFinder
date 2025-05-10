import { CreateProxyDto } from './create-proxy.dto'
import { PartialType } from '@nestjs/swagger'

export class UpdateProxyDto extends PartialType(CreateProxyDto) {}
