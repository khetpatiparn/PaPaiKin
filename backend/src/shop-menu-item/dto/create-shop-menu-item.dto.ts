import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { LocationDto } from 'src/common/dtos/location.dto';

export class AttributeDto {
  @IsString()
  @IsNotEmpty()
  declare category: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  declare ingredients: string[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  declare cookingMethod: string[];
}

export class CreateShopMenuItemDto {
  @IsMongoId()
  @IsNotEmpty()
  declare shopId: string;

  @IsMongoId()
  @IsNotEmpty()
  declare menuId: string;
  @IsString()
  @IsNotEmpty()
  declare shopName: string;

  @IsString()
  @IsNotEmpty()
  declare menuName: string;

  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  declare price: number;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  declare menuImage: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  declare shopImage: string;

  @ValidateNested()
  @Type(() => AttributeDto)
  @IsNotEmpty()
  declare attributes: AttributeDto;

  @ValidateNested()
  @Type(() => LocationDto)
  @IsNotEmpty()
  declare location: LocationDto;
}
