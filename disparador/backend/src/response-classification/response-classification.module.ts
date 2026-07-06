import { Module } from '@nestjs/common';
import { ResponseClassificationService } from './response-classification.service';
@Module({ providers: [ResponseClassificationService], exports: [ResponseClassificationService] })
export class ResponseClassificationModule {}
