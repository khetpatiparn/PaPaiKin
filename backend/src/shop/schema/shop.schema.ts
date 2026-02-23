import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema()
export class Shop {
  @Prop()
  declare shopName: string;

  @Prop()
  declare shopImage: string;

  @Prop()
  declare location: string;

  @Prop([String])
  declare deliveryOptions: string[];
}
