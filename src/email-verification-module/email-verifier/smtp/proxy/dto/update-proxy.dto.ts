import { CreateProxyDto } from './create-proxy.dto'
import { PartialType } from '@nestjs/swagger'
import { IUpdateProxyDto } from '../../../../../common'

export class UpdateProxyDto extends PartialType(CreateProxyDto) implements IUpdateProxyDto {}
