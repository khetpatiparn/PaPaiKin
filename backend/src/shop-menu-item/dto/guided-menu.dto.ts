import { Type } from 'class-transformer';
import {
  IsOptional,
  IsNotEmpty,
  IsString,
  ValidateNested,
  IsNumber,
} from 'class-validator';

export class UserAnswerDto {
  @IsString()
  @IsOptional()
  q1?: string;

  @IsString()
  @IsOptional()
  q2?: string;

  @IsString()
  @IsOptional()
  q3?: string;
}

export class UserLocationDto {
  @IsNumber()
  @IsNotEmpty()
  declare latitude: number;

  @IsNumber()
  @IsNotEmpty()
  declare longitude: number;
}

export class GuidedMenuDto {
  @ValidateNested()
  @Type(() => UserAnswerDto)
  @IsNotEmpty()
  declare userAnswer: UserAnswerDto;

  @ValidateNested()
  @Type(() => UserLocationDto)
  @IsNotEmpty()
  declare userLocation: UserLocationDto;
}
