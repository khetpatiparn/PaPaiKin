import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class Location {
  @Prop({ type: String, enum: ['Point'], default: 'Point' })
  declare type: string;

  @Prop([Number])
  declare coordinates: number[];
}

export const LocationSchema = SchemaFactory.createForClass(Location);
