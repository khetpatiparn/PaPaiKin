import { Test, TestingModule } from '@nestjs/testing';
import { ShopMenuItemController } from './shop-menu-item.controller';
import { ShopMenuItemService } from './shop-menu-item.service';

describe('ShopMenuItemController', () => {
  let controller: ShopMenuItemController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShopMenuItemController],
      providers: [ShopMenuItemService],
    }).compile();

    controller = module.get<ShopMenuItemController>(ShopMenuItemController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
