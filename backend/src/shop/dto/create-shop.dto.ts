import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { LocationDto } from 'src/common/dtos/location.dto';

export class CreateShopDto {
  @IsString()
  @IsNotEmpty()
  declare shopName: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  declare shopImage: string;

  @ValidateNested()
  @Type(() => LocationDto)
  @IsNotEmpty()
  declare location: LocationDto;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  declare deliveryOption: string[];
}
