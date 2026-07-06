import { Module } from '@nestjs/common';
import { MessageVariationsService } from './message-variations.service';
import { MessageVariationsController } from './message-variations.controller';

@Module({
  providers: [MessageVariationsService],
  controllers: [MessageVariationsController],
  exports: [MessageVariationsService],
})
export class MessageVariationsModule {}
