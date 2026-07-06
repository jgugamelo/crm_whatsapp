import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BlacklistService } from './blacklist.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Blacklist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('blacklist')
export class BlacklistController {
  constructor(private readonly blacklistService: BlacklistService) {}

  @Get()
  findAll(@Query('page') page = '1', @Query('limit') limit = '50') {
    return this.blacklistService.findAll(parseInt(page), parseInt(limit));
  }

  @Post()
  add(@Body() body: { telefone: string; motivo: string }) {
    return this.blacklistService.add(body.telefone, body.motivo);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.blacklistService.remove(id);
  }
}
