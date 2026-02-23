import { Test, TestingModule } from '@nestjs/testing';
import { ShopMenuItemService } from './shop-menu-item.service';

describe('ShopMenuItemService', () => {
  let service: ShopMenuItemService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShopMenuItemService],
    }).compile();

    service = module.get<ShopMenuItemService>(ShopMenuItemService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
