import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi, webhook } from '@line/bot-sdk';

@Injectable()
export class LineBotService {
  private readonly client: messagingApi.MessagingApiClient;

  constructor(private readonly configService: ConfigService) {
    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken: this.configService.get<string>(
        'LINE_CHANNEL_ACCESS_TOKEN',
      )!,
    });
  }

  private async replyText(replyToken: string, text: string): Promise<void> {
    await this.client.replyMessage({
      replyToken: replyToken,
      messages: [{ type: 'text', text }],
    });
  }

  async handleEvent(event: webhook.Event): Promise<void> {
    switch (event.type) {
      case 'message':
        const messageEvent = event as webhook.MessageEvent;
        if (messageEvent.message.type === 'text') {
          const userText = (messageEvent.message as webhook.TextMessageContent)
            .text;
          await this.replyText(
            messageEvent.replyToken!,
            `คุณพิมพ์ว่า: ${userText}`,
          );
        }
        break;
      case 'follow':
        await this.replyText(event.replyToken, 'ยินดีต้อนรับสู่ พาไปกิน!');
        break;
      default:
        // event อื่นๆ ยังไม่จัดการ
        break;
    }
  }
}
