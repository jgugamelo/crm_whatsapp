import { beforeEach, describe, expect, it } from 'vitest';
import { parseContactCsv, parseTagCell, formatName, normalizeAndValidatePhone } from './parse-contact-csv';

beforeEach(() => {
  process.env.DEFAULT_COUNTRY_CODE = '1';
});

describe('formatName', () => {
  it('formats names in Portuguese Title Case', () => {
    expect(formatName('FABIANE PEREIRA', 'title_case')).toBe('Fabiane Pereira');
    expect(formatName('JACILENE OLIVEIRA DA SILVA', 'title_case')).toBe('Jacilene Oliveira da Silva');
    expect(formatName('ANA PAULA DANTAS DOS SANTOS', 'title_case')).toBe('Ana Paula Dantas dos Santos');
    expect(formatName('FABIO GONÇALVES PAVÃO', 'title_case')).toBe('Fabio Gonçalves Pavão');
  });

  it('extracts only the first name when requested', () => {
    expect(formatName('FABIANE PEREIRA', 'first_name')).toBe('Fabiane');
    expect(formatName('JACILENE OLIVEIRA DA SILVA', 'first_name')).toBe('Jacilene');
  });

  it('keeps original casing when mode is original', () => {
    expect(formatName('FABIANE PEREIRA', 'original')).toBe('FABIANE PEREIRA');
  });
});

describe('normalizeAndValidatePhone', () => {
  it('normalizes Brazilian numbers to +55 format', () => {
    expect(normalizeAndValidatePhone('(21)96417-8103')).toEqual({
      phone: '+5521964178103',
      isValid: true,
    });
    expect(normalizeAndValidatePhone('21978494646')).toEqual({
      phone: '+5521978494646',
      isValid: true,
    });
    expect(normalizeAndValidatePhone('+55 (91) 99149-4041')).toEqual({
      phone: '+5591991494041',
      isValid: true,
    });
  });

  it('filters out incomplete or invalid numbers', () => {
    expect(normalizeAndValidatePhone('(55)21984-2624')).toEqual({
      phone: '',
      isValid: false,
    });
    expect(normalizeAndValidatePhone('(21)9849-46')).toEqual({
      phone: '',
      isValid: false,
    });
    expect(normalizeAndValidatePhone('')).toEqual({
      phone: '',
      isValid: false,
    });
  });
});

describe('parseTagCell', () => {
  it('splits comma-separated tags and trims whitespace', () => {
    expect(parseTagCell(' VIP , Lead ,  ')).toEqual(['VIP', 'Lead']);
  });

  it('splits semicolon-separated tags', () => {
    expect(parseTagCell('VIP; Lead; Customer')).toEqual([
      'VIP',
      'Lead',
      'Customer',
    ]);
  });

  it('de-dupes case-insensitively', () => {
    expect(parseTagCell('vip, VIP, Lead')).toEqual(['vip', 'Lead']);
  });

  it('returns empty for blank values', () => {
    expect(parseTagCell('')).toEqual([]);
    expect(parseTagCell(undefined)).toEqual([]);
  });
});

describe('parseContactCsv', () => {
  it('parses optional tags column and applies name formatting', () => {
    const csv = `phone,name,tags
21964178103,FABIANE PEREIRA,"VIP, Lead"
21978494646,CRISTINA EU LENA GUERRA BAPTISTA,Customer`;

    expect(parseContactCsv(csv, 'title_case')).toEqual({
      hasTagsColumn: true,
      hasCompanyColumn: false,
      invalidRowsCount: 0,
      rows: [
        {
          phone: '+5521964178103',
          name: 'Fabiane Pereira',
          email: undefined,
          company: undefined,
          tagNames: ['VIP', 'Lead'],
        },
        {
          phone: '+5521978494646',
          name: 'Cristina Eu Lena Guerra Baptista',
          email: undefined,
          company: undefined,
          tagNames: ['Customer'],
        },
      ],
    });
  });

  it('excludes invalid/incomplete phone numbers', () => {
    const csv = `phone,name
21964178103,FABIANE PEREIRA
55219842624,INVALID NUMBER`;

    expect(parseContactCsv(csv)).toEqual({
      hasTagsColumn: false,
      hasCompanyColumn: false,
      invalidRowsCount: 1,
      rows: [
        {
          phone: '+5521964178103',
          name: 'Fabiane Pereira',
          email: undefined,
          company: undefined,
          tagNames: [],
        },
      ],
    });
  });
});
