import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ShopMenuItemService } from './shop-menu-item.service';
import { CreateShopMenuItemDto } from './dto/create-shop-menu-item.dto';
import { UpdateShopMenuItemDto } from './dto/update-shop-menu-item.dto';
import { ControlMenuDto } from './dto/control-menu.dto';

@Controller('shop-menu-item')
export class ShopMenuItemController {
  constructor(private readonly shopMenuItemService: ShopMenuItemService) {}

  @Post()
  create(@Body() createShopMenuItemDto: CreateShopMenuItemDto) {
    return this.shopMenuItemService.create(createShopMenuItemDto);
  }

  @Get()
  findAll() {
    return this.shopMenuItemService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shopMenuItemService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateShopMenuItemDto: UpdateShopMenuItemDto,
  ) {
    return this.shopMenuItemService.update(+id, updateShopMenuItemDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.shopMenuItemService.remove(+id);
  }

  // Control-menu
  @Post('control-menu')
  controlMenu(@Body() controlMenuDto: ControlMenuDto) {
    return this.shopMenuItemService.findByFilter(controlMenuDto);
  }
}
