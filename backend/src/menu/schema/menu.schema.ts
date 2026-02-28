import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MenuDocument = HydratedDocument<Menu>;

@Schema()
export class Menu {
  @Prop({ required: true })
  declare menuName: string;

  @Prop({ required: true })
  declare menuImage: string;

  @Prop({ required: true })
  declare category: string;

  @Prop([String])
  declare ingredients: string[];

  @Prop([String])
  declare cookingMethod: string[];
}

export const MenuSchema = SchemaFactory.createForClass(Menu);
