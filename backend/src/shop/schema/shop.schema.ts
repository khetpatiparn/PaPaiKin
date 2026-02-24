import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Location, LocationSchema } from 'src/common/schemas/location.schema';

export type ShopDocument = HydratedDocument<Shop>;

@Schema()
export class Shop {
  @Prop({ required: true })
  declare shopName: string;

  @Prop({ required: true })
  declare shopImage: string;

  @Prop({ type: LocationSchema, required: true })
  declare location: Location;

  @Prop([String])
  declare deliveryOptions: string[];
}

export const ShopSchema = SchemaFactory.createForClass(Shop);

ShopSchema.index({ location: '2dsphere' });
