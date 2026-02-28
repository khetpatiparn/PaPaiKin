import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateMenuDto {
  @IsString()
  @IsNotEmpty()
  declare menuName: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  declare menuImage: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  declare ingredients: string[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  declare cookingMethod: string[];
}
