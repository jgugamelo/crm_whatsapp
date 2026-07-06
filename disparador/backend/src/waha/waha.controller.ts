import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WahaService } from './waha.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('WAHA Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class WahaController {
  constructor(private readonly wahaService: WahaService) {}

  @Get()
  list() {
    return this.wahaService.dbListSessions();
  }

  @Get('waha/available')
  listWahaAvailable() {
    return this.wahaService.listWahaSessions();
  }

  @Get('waha/health')
  wahaHealth() {
    return this.wahaService.wahaHealthCheck();
  }

  @Post('waha/sync-all')
  async syncAll() {
    const sessions = await this.wahaService.dbListSessions();
    const results = await Promise.allSettled(
      (sessions ?? []).map((s: any) => this.wahaService.syncSessionStatus(s.waha_session_name)),
    );
    return { synced: results.length };
  }

  @Post()
  create(@Body() body: { nome_sessao: string; telefone?: string; limite_diario?: number }) {
    return this.wahaService.dbCreateSession(body);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.wahaService.dbGetSession(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.wahaService.dbDeleteSession(id);
  }

  @Patch(':id/proxy')
  updateProxy(
    @Param('id') id: string,
    @Body() body: { proxy_server: string; proxy_username?: string; proxy_password?: string },
  ) {
    return this.wahaService.dbUpdateProxy(id, body);
  }

  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    const session = await this.wahaService.dbGetSession(id);
    const status = await this.wahaService.syncSessionStatus(session.waha_session_name);
    return { status };
  }

  @Get(':id/qrcode')
  async qrCode(@Param('id') id: string) {
    const session = await this.wahaService.dbGetSession(id);
    return this.wahaService.getQrCode(session.waha_session_name);
  }

  @Post(':id/start')
  async start(@Param('id') id: string) {
    const session = await this.wahaService.dbGetSession(id);
    return this.wahaService.startSession(session.waha_session_name);
  }

  @Post(':id/stop')
  async stop(@Param('id') id: string) {
    const session = await this.wahaService.dbGetSession(id);
    return this.wahaService.stopSession(session.waha_session_name);
  }

  @Post(':id/sync')
  async sync(@Param('id') id: string) {
    const session = await this.wahaService.dbGetSession(id);
    const status = await this.wahaService.syncSessionStatus(session.waha_session_name);
    return { status };
  }
}
