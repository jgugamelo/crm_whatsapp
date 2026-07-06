import { Module } from '@nestjs/common';
import { MessageQueueService } from './message-queue.service';
import { MessageQueueWorker } from './message-queue.worker';
import { MessageQueueController, MessageQueueCronController } from './message-queue.controller';
import { WahaModule } from '../waha/waha.module';
import { BlacklistModule } from '../blacklist/blacklist.module';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [WahaModule, BlacklistModule, RiskModule],
  providers: [MessageQueueService, MessageQueueWorker],
  controllers: [MessageQueueController, MessageQueueCronController],
  exports: [MessageQueueService],
})
export class MessageQueueModule {}
