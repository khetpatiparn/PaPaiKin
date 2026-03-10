import { IsMongoId, IsNotEmpty } from 'class-validator';

export class RestaurantListingDto {
  @IsMongoId()
  @IsNotEmpty()
  declare menuId: string;
}
