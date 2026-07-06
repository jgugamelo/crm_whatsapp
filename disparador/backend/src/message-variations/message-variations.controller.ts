import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MessageVariationsService } from './message-variations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Message Variations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('message-variations')
export class MessageVariationsController {
  constructor(private readonly service: MessageVariationsService) {}

  @Post('generate')
  generate(
    @Body() body: {
      campaign_id: string;
      mensagem_base: string;
      quantidade: number;
      tom: string;
      limite_caracteres?: number;
    },
  ) {
    return this.service.generate(body.campaign_id, {
      mensagem_base: body.mensagem_base,
      quantidade: body.quantidade,
      tom: body.tom,
      limite_caracteres: body.limite_caracteres,
    });
  }

  @Get('campaign/:campaignId')
  findByCampaign(
    @Param('campaignId') campaignId: string,
    @Query('only_approved') onlyApproved?: string,
  ) {
    return this.service.findByCampaign(campaignId, onlyApproved === 'true');
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.service.approve(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.service.reject(id);
  }
}
