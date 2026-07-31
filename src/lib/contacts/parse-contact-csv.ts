/**
 * CSV parsing for the contacts import modal. Shared + unit-tested so
 * tag-column handling stays aligned with phone/name/email/company.
 */

export type NameFormatMode = 'title_case' | 'first_name' | 'original';

export interface ParsedContactRow {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  /** Tag names from the optional `tags` column (comma/semicolon separated). */
  tagNames: string[];
}

/** Split a CSV cell into unique tag names (case-insensitive de-dupe). */
export function parseTagCell(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of value.split(/[,;]/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

export interface ParseContactCsvResult {
  rows: ParsedContactRow[];
  /** True when the CSV header includes a `tags` column. */
  hasTagsColumn: boolean;
  /** True when the CSV header includes a `company` column. */
  hasCompanyColumn: boolean;
  /** Count of rows skipped due to invalid/incomplete phone numbers. */
  invalidRowsCount: number;
}

/**
 * Portuguese Title Case / First Name formatting:
 * - Capitalizes first letter of words.
 * - Lowercases connectives: da, de, do, das, dos, e.
 * - Respects accents (Á, É, Í, Ó, Ú, Â, Ê, Ô, Ã, Õ, Ç).
 * - Option 'first_name' extracts only the first name (e.g. "Fabiane").
 */
export function formatName(
  name: string | undefined,
  mode: NameFormatMode = 'title_case'
): string | undefined {
  if (!name || !name.trim()) return undefined;
  const trimmed = name.trim();
  if (mode === 'original') return trimmed;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return undefined;

  if (mode === 'first_name') {
    const first = words[0].toLowerCase();
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  // Title Case for full name
  const connectives = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const formatted = words.map((w, idx) => {
    const lower = w.toLowerCase();
    if (idx > 0 && idx < words.length - 1 && connectives.has(lower)) {
      return lower;
    }
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  return formatted.join(' ');
}

/** 
 * Strict phone normalization and validation:
 * - Always prepends +55 for 10-digit (landline) or 11-digit (mobile) Brazilian numbers.
 * - Ensures valid DDD (11 to 99) and correct digit counts:
 *   - Mobile: 13 digits (+55 + 2 DDD + 9 digits starting with 9) e.g., +5521964178103
 *   - Landline: 12 digits (+55 + 2 DDD + 8 digits starting with 2..5) e.g., +552133445566
 * - Returns { phone: '+55...', isValid: true } or { phone: '', isValid: false } for incomplete/invalid numbers.
 */
export function normalizeAndValidatePhone(phone: string): { phone: string; isValid: boolean } {
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return { phone: '', isValid: false };

  // Remove leading zeros (e.g. 021964178103 or 005521964178103)
  while (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  if (!cleaned) return { phone: '', isValid: false };

  // If number does not start with 55, check if it's a Brazilian number missing 55
  if (!cleaned.startsWith('55')) {
    if (cleaned.length === 10 || cleaned.length === 11) {
      const ddd = parseInt(cleaned.slice(0, 2), 10);
      if (ddd >= 11 && ddd <= 99) {
        cleaned = '55' + cleaned;
      }
    }
  }

  // Brazilian number check (+55)
  if (cleaned.startsWith('55')) {
    // Total digits for Brazil must be 12 (landline) or 13 (mobile)
    if (cleaned.length < 12 || cleaned.length > 13) {
      return { phone: '', isValid: false };
    }

    const ddd = parseInt(cleaned.slice(2, 4), 10);
    if (isNaN(ddd) || ddd < 11 || ddd > 99) {
      return { phone: '', isValid: false };
    }

    const numberPart = cleaned.slice(4);
    // Mobile numbers (length 13 -> 9 digits in numberPart) must start with 9
    if (cleaned.length === 13) {
      if (!numberPart.startsWith('9')) {
        return { phone: '', isValid: false };
      }
    }
    // Landline numbers (length 12 -> 8 digits in numberPart) must start with 2, 3, 4, or 5
    else if (cleaned.length === 12) {
      const firstDigit = numberPart.charAt(0);
      if (!['2', '3', '4', '5'].includes(firstDigit)) {
        return { phone: '', isValid: false };
      }
    }

    return { phone: '+' + cleaned, isValid: true };
  }

  // Non-Brazilian international numbers (10 to 15 digits)
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return { phone: '+' + cleaned, isValid: true };
  }

  return { phone: '', isValid: false };
}

/** Legacy helper for backward compatibility */
export function smartNormalizePhone(phone: string): string {
  const result = normalizeAndValidatePhone(phone);
  return result.isValid ? result.phone : '';
}

export function parseContactCsv(
  text: string,
  nameMode: NameFormatMode = 'title_case'
): ParseContactCsvResult {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { rows: [], hasTagsColumn: false, hasCompanyColumn: false, invalidRowsCount: 0 };
  }

  // Auto-detect delimiter: comma vs semicolon (semicolon is very common in Excel exports in Brazil/Europe)
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';

  const headers = firstLine
    .split(delimiter)
    .map((h) => h.trim().toLowerCase().replace(/["']/g, ''));

  // Multi-language aliases to match columns gracefully
  const phoneAliases = ['phone', 'telefone', 'tel', 'celular', 'numero', 'número', 'whatsapp', 'whats', 'contato', 'contact'];
  const nameAliases = ['name', 'nome', 'fullname', 'nome completo', 'cliente'];
  const emailAliases = ['email', 'e-mail', 'mail', 'correio'];
  const companyAliases = ['company', 'company_name', 'empresa', 'razão social', 'corporação'];
  const tagsAliases = ['tags', 'tag', 'etiquetas', 'etiqueta', 'categoria', 'categorias', 'grupos', 'grupo'];

  const findHeaderIndex = (aliases: string[]) => {
    return headers.findIndex((h) => aliases.includes(h));
  };

  const phoneIdx = findHeaderIndex(phoneAliases);
  if (phoneIdx === -1) {
    return { rows: [], hasTagsColumn: false, hasCompanyColumn: false, invalidRowsCount: 0 };
  }

  const nameIdx = findHeaderIndex(nameAliases);
  const emailIdx = findHeaderIndex(emailAliases);
  const companyIdx = findHeaderIndex(companyAliases);
  const tagsIdx = findHeaderIndex(tagsAliases);

  const rows: ParsedContactRow[] = [];
  let invalidRowsCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line, delimiter);
    const rawPhone = values[phoneIdx]?.replace(/["']/g, '').trim();
    if (!rawPhone) {
      invalidRowsCount++;
      continue;
    }

    const { phone, isValid } = normalizeAndValidatePhone(rawPhone);
    if (!isValid || !phone) {
      invalidRowsCount++;
      continue;
    }

    const rawName = nameIdx >= 0 ? values[nameIdx]?.replace(/["']/g, '').trim() || undefined : undefined;
    const formattedName = formatName(rawName, nameMode);

    rows.push({
      phone,
      name: formattedName,
      email:
        emailIdx >= 0
          ? values[emailIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      company:
        companyIdx >= 0
          ? values[companyIdx]?.replace(/["']/g, '').trim() || undefined
          : undefined,
      tagNames:
        tagsIdx >= 0 ? parseTagCell(values[tagsIdx]?.replace(/["']/g, '')) : [],
    });
  }

  return {
    rows,
    hasTagsColumn: tagsIdx >= 0,
    hasCompanyColumn: companyIdx >= 0,
    invalidRowsCount,
  };
}

/** Simple CSV line parse (handles quoted fields and dynamic delimiters). */
function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

