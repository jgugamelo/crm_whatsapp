import { Module } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { MessageVariationsModule } from '../message-variations/message-variations.module';
import { MessageQueueModule } from '../message-queue/message-queue.module';

@Module({
  imports: [MessageVariationsModule, MessageQueueModule],
  providers: [CampaignsService],
  controllers: [CampaignsController],
  exports: [CampaignsService],
})
export class CampaignsModule {}
