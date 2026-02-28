import { IsOptional, IsString } from 'class-validator';

export class ControlMenuDto {
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
