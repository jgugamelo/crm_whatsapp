import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';

@ApiTags('Contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get('tags')
  listTags() {
    return this.contactsService.listTags();
  }

  @Post()
  createOne(@Body() body: any, @Request() req: any) {
    return this.contactsService.createOne(body, req.user.sub);
  }

  @Post('bulk')
  createBulk(@Body('contacts') contacts: any[], @Request() req: any) {
    return this.contactsService.importContacts(contacts, req.user.sub);
  }

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('nivel_risco') nivel_risco?: string,
    @Query('origem') origem?: string,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.contactsService.findAll({
      status, nivel_risco, origem, search, tag,
      page: parseInt(page), limit: parseInt(limit),
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contactsService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.contactsService.updateStatus(id, status);
  }

  @Patch(':id/block')
  block(@Param('id') id: string, @Body('motivo') motivo: string) {
    return this.contactsService.blockContact(id, motivo || 'bloqueio_manual');
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.contactsService.update(id, body);
  }

  @Delete('bulk')
  bulkDelete(@Body('ids') ids: string[]) {
    return this.contactsService.bulkDelete(ids);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.contactsService.delete(id);
  }

  @Post('import/csv')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    // Remove BOM (\uFEFF) que o Excel BR injeta no início do arquivo
    let content = file.buffer.toString('utf-8').replace(/^\uFEFF/, '');

    // Remove linha "sep=;" que o Excel BR usa para declarar o delimitador
    let delimiter: string | undefined;
    const firstLineEnd = content.indexOf('\n');
    const firstLine = firstLineEnd >= 0 ? content.slice(0, firstLineEnd).trim() : content.trim();
    if (/^sep=/i.test(firstLine)) {
      delimiter = firstLine.split('=')[1]?.trim();
      content = content.slice(firstLineEnd + 1);
    }

    const parsed = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      ...(delimiter ? { delimiter } : {}),
    });
    return this.contactsService.importContacts(parsed.data as any[], req.user.sub);
  }

  @Post('import/xlsx')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importXlsx(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    return this.contactsService.importContacts(rows as any[], req.user.sub);
  }
}
