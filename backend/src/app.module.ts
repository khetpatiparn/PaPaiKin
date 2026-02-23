import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// config
import { ConfigModule } from '@nestjs/config';
// mongoose
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    ConfigModule.forRoot(), MongooseModule.forRoot()],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
