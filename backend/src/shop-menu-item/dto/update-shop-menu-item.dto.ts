import { PartialType } from '@nestjs/mapped-types';
import { CreateShopMenuItemDto } from './create-shop-menu-item.dto';

export class UpdateShopMenuItemDto extends PartialType(CreateShopMenuItemDto) {}
