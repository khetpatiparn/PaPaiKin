import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsNumber,
  IsString,
  IsArray,
} from 'class-validator';

export class LocationDto {
  @IsString()
  @IsEnum(['Point'])
  declare type: string;

  @IsArray()
  @IsNumber({}, { each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  declare coordinates: number[];
}
