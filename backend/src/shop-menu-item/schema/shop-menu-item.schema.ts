import * as mongoose from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Location, LocationSchema } from 'src/common/schemas/location.schema';

export type ShopMenuItemDocument = HydratedDocument<ShopMenuItem>;

@Schema({ _id: false })
export class Attribute {
  @Prop({ required: true })
  declare category: string;

  @Prop([String])
  declare ingredients: string[];

  @Prop([String])
  declare cookingMethod: string[];
}

export const AttributeSchema = SchemaFactory.createForClass(Attribute);

@Schema()
export class ShopMenuItem {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true })
  declare shopId: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Menu', required: true })
  declare menuId: mongoose.Types.ObjectId;

  @Prop({ required: true })
  declare shopName: string;

  @Prop({ required: true })
  declare menuName: string;

  @Prop({ required: true, min: 0 })
  declare price: number;

  @Prop({ required: true })
  declare menuImage: string;

  @Prop({ required: true })
  declare shopImage: string;

  @Prop({ type: AttributeSchema })
  declare attributes: Attribute;

  @Prop({ type: LocationSchema, required: true })
  declare location: Location;
}

export const ShopMenuItemSchema = SchemaFactory.createForClass(ShopMenuItem);

ShopMenuItemSchema.index({ location: '2dsphere' });
