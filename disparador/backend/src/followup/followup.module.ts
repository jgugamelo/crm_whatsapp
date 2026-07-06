import { Module } from '@nestjs/common';
import { FollowupService } from './followup.service';
import { BlacklistModule } from '../blacklist/blacklist.module';
import { MessageVariationsModule } from '../message-variations/message-variations.module';
import { WahaModule } from '../waha/waha.module';
@Module({ imports: [BlacklistModule, MessageVariationsModule, WahaModule], providers: [FollowupService], exports: [FollowupService] })
export class FollowupModule {}
