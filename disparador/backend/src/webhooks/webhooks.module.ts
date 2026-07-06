import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { BlacklistModule } from '../blacklist/blacklist.module';
import { ResponseClassificationModule } from '../response-classification/response-classification.module';
import { RiskModule } from '../risk/risk.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [BlacklistModule, ResponseClassificationModule, RiskModule, AttendanceModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
