import {
  Controller,
  Post,
  Headers,
  Req,
  Body,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LINE_SIGNATURE_HTTP_HEADER_NAME,
  validateSignature,
  webhook,
} from '@line/bot-sdk';
import type { Request } from 'express';
import { LineBotService } from './line-bot.service';

@Controller('line-bot')
export class LineBotController {
  constructor(
    private readonly lineBotService: LineBotService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Headers(LINE_SIGNATURE_HTTP_HEADER_NAME) signature: string,
    @Req() req: Request,
    @Body() body: { events: webhook.Event[] },
  ) {
    const channelSecret = this.configService.get<string>(
      'LINE_CHANNEL_SECRET',
    )!;

    const isValid = validateSignature(
      (req as Request & { rawBody: Buffer }).rawBody,
      channelSecret,
      signature,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid LINE signature');
    }

    await Promise.all(
      body.events.map((event) => this.lineBotService.handleEvent(event)),
    );

    return { status: 'ok' };
  }
}
