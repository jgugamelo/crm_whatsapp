import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ContactsModule } from './contacts/contacts.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { MessageVariationsModule } from './message-variations/message-variations.module';
import { MessageQueueModule } from './message-queue/message-queue.module';
import { WahaModule } from './waha/waha.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { BlacklistModule } from './blacklist/blacklist.module';
import { RiskModule } from './risk/risk.module';
import { FollowupModule } from './followup/followup.module';
import { ResponseClassificationModule } from './response-classification/response-classification.module';
import { AttendanceModule } from './attendance/attendance.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UploadsModule } from './uploads/uploads.module';
import { SupabaseModule } from './common/supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    SupabaseModule,
    AuthModule,
    UsersModule,
    ContactsModule,
    CampaignsModule,
    MessageVariationsModule,
    MessageQueueModule,
    WahaModule,
    WebhooksModule,
    BlacklistModule,
    RiskModule,
    FollowupModule,
    ResponseClassificationModule,
    AttendanceModule,
    DashboardModule,
    UploadsModule,
  ],
})
export class AppModule {}
