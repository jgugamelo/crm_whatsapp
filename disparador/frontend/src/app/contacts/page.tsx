'use client';
import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { contactsApi, normalizePhoneInput } from '@/lib/api';
import {
  Upload, Search, Ban, Users, CheckCircle2, X,
  ChevronLeft, ChevronRight, Plus, ClipboardList, UserPlus,
  Pencil, Trash2, AlertTriangle, Download,
} from 'lucide-react';

function downloadTemplate() {
  const data = [
    { nome: 'Maria Silva',   telefone: '11999990001', email: 'maria@email.com', tags: 'lead,quente', origem: 'instagram', curso: 'Direito',  categoria: 'Lead quente' },
    { nome: 'João Oliveira', telefone: '21988880002', email: '',                tags: 'lead',        origem: 'site',      curso: 'Medicina', categoria: '' },
    { nome: 'Ana Souza',     telefone: '31977770003', email: 'ana@empresa.com', tags: 'cliente,vip', origem: 'indicacao', curso: '',         categoria: 'Cliente VIP' },
    { nome: 'Carlos Lima',   telefone: '5511966660004', email: '',              tags: '',            origem: 'manual',    curso: '',         categoria: '' },
  ];

  const ws = XLSX.utils.json_to_sheet(data, {
    header: ['nome', 'telefone', 'email', 'tags', 'origem', 'curso', 'categoria'],
  });

  // Largura das colunas
  ws['!cols'] = [
    { wch: 20 }, { wch: 18 }, { wch: 25 }, { wch: 20 },
    { wch: 14 }, { wch: 16 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
  XLSX.writeFile(wb, 'template_contatos.xlsx');
}
import clsx from 'clsx';

const STATUS_COLORS: Record<string, string> = {
  novo:            'bg-slate-100 text-slate-600',
  apto_para_envio: 'bg-[#FFF3EC] text-[#FF5706]',
  em_campanha:     'bg-blue-100 text-blue-700',
  interessado:     'bg-blue-100 text-blue-700',
  convertido:      'bg-[#F0FDF4] text-[#10B981]',
  sem_interesse:   'bg-slate-100 text-slate-500',
  removido:        'bg-red-100 text-red-600',
  bloqueado:       'bg-red-100 text-red-700',
  numero_invalido: 'bg-orange-100 text-orange-600',
  risco_alto:      'bg-red-100 text-red-700',
};

const RISK_COLORS: Record<string, string> = {
  baixo: 'text-[#10B981]',
  medio: 'text-amber-500',
  alto:  'text-red-500',
};

const STATUS_OPTIONS = [
  'novo','apto_para_envio','em_campanha','interessado','convertido',
  'sem_interesse','removido','bloqueado','numero_invalido',
];

const EMPTY_SINGLE = () => ({ nome: '', telefone: '+55', email: '', origem: 'manual', newTag: '' });

function parsePastedTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const all = lines.map(l => l.split(sep).map(c => c.trim()));
  const firstRow = all[0];
  const looksLikeHeader = firstRow.some(c =>
    /^(nome|name|telefone|tel|phone|celular|fone|tag|tags|email|origem)$/i.test(c),
  );
  if (looksLikeHeader) return { headers: firstRow, rows: all.slice(1) };
  return { headers: ['nome', 'telefone', 'tag'], rows: all };
}

function mapRowToContact(headers: string[], row: string[], globalTag: string) {
  const idx = (names: string[]) => headers.findIndex(h => names.includes(h.toLowerCase()));
  const get = (names: string[]) => { const i = idx(names); return i >= 0 ? row[i] || '' : ''; };
  const nome = get(['nome', 'name']);
  const telefone = get(['telefone', 'tel', 'phone', 'celular', 'fone']) || row[0] || '';
  const rowTag = get(['tag', 'tags']);
  const tags = Array.from(new Set([rowTag, globalTag].filter(Boolean)));
  return { nome: nome || undefined, telefone, tags };
}

export default function ContactsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState('');
  const [tag, setTag]             = useState('');
  const [page, setPage]           = useState(1);
  const [limit, setLimit]         = useState(50);
  const [importResult, setImportResult] = useState<any>(null);

  // ── Create modal ──────────────────────────────────────────
  const [showCreate, setShowCreate]   = useState(false);
  const [createTab, setCreateTab]     = useState<'individual' | 'tabela'>('individual');
  const [singleForm, setSingleForm]   = useState(EMPTY_SINGLE());
  const [singleTags, setSingleTags]   = useState<string[]>([]);
  const [pasteText, setPasteText]     = useState('');
  const [parsedTable, setParsedTable] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [globalTag, setGlobalTag]     = useState('');

  // ── Edit modal ────────────────────────────────────────────
  const [editContact, setEditContact] = useState<any>(null);
  const [editForm, setEditForm]       = useState<any>({});
  const [editTags, setEditTags]       = useState<string[]>([]);
  const [editNewTag, setEditNewTag]   = useState('');

  // ── Delete ────────────────────────────────────────────────
  const [deleteId, setDeleteId]           = useState<string | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // ── Selection ─────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Queries ───────────────────────────────────────────────
  const { data, isLoading } = useQuery(
    ['contacts', search, status, tag, page, limit],
    () => contactsApi.list({ search, status, tag, page, limit }).then(r => r.data),
    { keepPreviousData: true },
  );

  const { data: existingTags = [] } = useQuery('contact-tags', () =>
    contactsApi.tags().then(r => r.data ?? []),
  );

  const contacts: any[] = data?.data || [];
  const total: number   = data?.total || 0;

  // ── Mutations ─────────────────────────────────────────────
  const importMut = useMutation(
    (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return ext === 'csv'
        ? contactsApi.importCsv(file).then(r => r.data)
        : contactsApi.importXlsx(file).then(r => r.data);
    },
    { onSuccess: (res) => { setImportResult(res); qc.invalidateQueries('contacts'); qc.invalidateQueries('contact-tags'); } },
  );

  const createOneMut = useMutation(
    (d: any) => contactsApi.createOne(d).then(r => r.data),
    { onSuccess: () => { qc.invalidateQueries('contacts'); qc.invalidateQueries('contact-tags'); closeCreate(); } },
  );

  const createBulkMut = useMutation(
    (contacts: any[]) => contactsApi.createBulk(contacts).then(r => r.data),
    { onSuccess: (res) => { setImportResult(res); qc.invalidateQueries('contacts'); qc.invalidateQueries('contact-tags'); closeCreate(); } },
  );

  const blockMut = useMutation((id: string) => contactsApi.block(id), {
    onSuccess: () => qc.invalidateQueries('contacts'),
  });

  const editMut = useMutation(
    ({ id, data }: { id: string; data: any }) => contactsApi.update(id, data),
    { onSuccess: () => { qc.invalidateQueries('contacts'); qc.invalidateQueries('contact-tags'); setEditContact(null); } },
  );

  const deleteMut = useMutation((id: string) => contactsApi.delete(id), {
    onSuccess: () => { qc.invalidateQueries('contacts'); setDeleteId(null); setSelected(s => { s.delete(deleteId!); return new Set(s); }); },
  });

  const bulkDeleteMut = useMutation((ids: string[]) => contactsApi.bulkDelete(ids), {
    onSuccess: () => { qc.invalidateQueries('contacts'); setSelected(new Set()); setShowBulkDelete(false); },
  });

  // ── Helpers ───────────────────────────────────────────────
  const closeCreate = () => {
    setShowCreate(false); setCreateTab('individual');
    setSingleForm(EMPTY_SINGLE()); setSingleTags([]);
    setPasteText(''); setParsedTable(null); setGlobalTag('');
  };

  const openEdit = (c: any) => {
    setEditContact(c);
    setEditForm({ nome: c.nome || '', telefone: c.telefone_normalizado || '', email: c.email || '', origem: c.origem || 'manual', curso: c.curso || '', categoria: c.categoria || '', status_contato: c.status_contato || 'apto_para_envio' });
    setEditTags(c.tags || []);
    setEditNewTag('');
  };

  const addSingleTag  = (tag: string) => { const t = tag.trim(); if (t && !singleTags.includes(t)) setSingleTags(p => [...p, t]); setSingleForm(f => ({ ...f, newTag: '' })); };
  const removeSingleTag = (tag: string) => setSingleTags(p => p.filter(t => t !== tag));
  const addEditTag    = (tag: string) => { const t = tag.trim(); if (t && !editTags.includes(t)) setEditTags(p => [...p, t]); setEditNewTag(''); };
  const removeEditTag = (tag: string) => setEditTags(p => p.filter(t => t !== tag));

  const handleParse = () => setParsedTable(parsePastedTable(pasteText));

  const handleBulkImport = () => {
    if (!parsedTable) return;
    const cs = parsedTable.rows.map(row => mapRowToContact(parsedTable.headers, row, globalTag)).filter(c => c.telefone);
    createBulkMut.mutate(cs);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { importMut.mutate(file); e.target.value = ''; }
  };

  const toggleSelect = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll    = () => setSelected(selected.size === contacts.length ? new Set() : new Set(contacts.map((c: any) => c.id)));
  const allSelected  = contacts.length > 0 && selected.size === contacts.length;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Contatos</h1>
          <p className="text-slate-400 text-sm mt-1">Importe e gerencie sua base de contatos</p>
        </div>
        <div className="flex items-center gap-2">
          {importMut.isLoading && (
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 border-2 border-[#FF5706] border-t-transparent rounded-full animate-spin" />
              Importando...
            </span>
          )}
          <button onClick={downloadTemplate} className="btn-ghost" title="Baixar planilha modelo para preenchimento">
            <Download size={15} /> Template
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFile} />
          <button onClick={() => fileRef.current?.click()} className="btn-ghost">
            <Upload size={15} /> CSV / XLSX
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={15} /> Novo Contato
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className="flex items-start gap-3 bg-[#F0FDF4] border border-[#10B981] rounded-2xl p-4">
          <CheckCircle2 size={18} className="text-[#10B981] flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-[#065F46]">
            Importação concluída — <strong>{importResult.importados}</strong> importados,{' '}
            <strong>{importResult.duplicados}</strong> duplicados,{' '}
            <strong>{importResult.invalidos}</strong> inválidos,{' '}
            <strong>{importResult.blacklisted}</strong> na blacklist.
          </div>
          <button onClick={() => setImportResult(null)} className="text-[#10B981] hover:text-[#059669] p-0.5"><X size={15} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar nome ou telefone..." className="input pl-9" />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input w-auto">
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={tag} onChange={e => { setTag(e.target.value); setPage(1); }} className="input w-auto">
          <option value="">Todas as tags</option>
          {(existingTags as string[]).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-[#FFF3EC] border border-[#FF8754] rounded-2xl px-5 py-3">
          <span className="text-sm font-medium text-[#E84B00]">{selected.size} contato{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="text-xs text-[#FF5706] hover:text-[#E84B00]">Cancelar seleção</button>
            <button
              onClick={() => setShowBulkDelete(true)}
              className="inline-flex items-center gap-1.5 text-xs bg-red-500 hover:bg-red-600 text-white font-medium px-3 py-1.5 rounded-lg transition-all"
            >
              <Trash2 size={13} /> Excluir {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="px-4 py-3.5 w-10">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="rounded border-slate-300 text-[#FF5706] focus:ring-[#FF5706]" />
              </th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Nome</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Telefone</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Tags</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Risco</th>
              <th className="px-4 py-3.5 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded-lg animate-pulse w-full" /></td></tr>
            ))}
            {!isLoading && contacts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <Users size={32} className="mx-auto text-slate-200 mb-3" />
                  <p className="text-slate-400 text-sm">Nenhum contato encontrado</p>
                  <button onClick={() => setShowCreate(true)} className="btn-primary mt-4 mx-auto"><Plus size={14} /> Adicionar contato</button>
                </td>
              </tr>
            )}
            {contacts.map((c: any) => (
              <tr key={c.id} className={clsx('hover:bg-slate-50/60 transition-colors group', selected.has(c.id) && 'bg-[#FFF3EC]/40')}>
                <td className="px-4 py-3.5">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)}
                    className="rounded border-slate-300 text-[#FF5706] focus:ring-[#FF5706]" />
                </td>
                <td className="px-4 py-3.5 font-medium text-slate-900">{c.nome || '—'}</td>
                <td className="px-4 py-3.5 text-slate-500 font-mono text-xs">{c.telefone_normalizado}</td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags || []).map((t: string) => (
                      <span key={t} className="text-[10px] bg-[#FFF3EC] text-[#FF5706] px-2 py-0.5 rounded-full font-medium">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className={clsx('badge', STATUS_COLORS[c.status_contato] || 'bg-slate-100 text-slate-500')}>
                    {c.status_contato?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className={clsx('text-xs font-semibold capitalize', RISK_COLORS[c.nivel_risco] || 'text-slate-400')}>
                    {c.nivel_risco || '—'}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(c)}
                      className="p-1.5 text-slate-400 hover:text-[#FF5706] hover:bg-[#FFF3EC] rounded-lg transition-colors" title="Editar">
                      <Pencil size={14} />
                    </button>
                    {!['bloqueado', 'removido'].includes(c.status_contato) && (
                      <button onClick={() => blockMut.mutate(c.id)}
                        className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors" title="Bloquear">
                        <Ban size={14} />
                      </button>
                    )}
                    <button onClick={() => setDeleteId(c.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {total > 0 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-slate-50/40 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <p className="text-xs text-slate-400">{total.toLocaleString('pt-BR')} contatos</p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Por página:</span>
                {[10, 50, 100, 250].map(n => (
                  <button key={n} onClick={() => { setLimit(n); setPage(1); }}
                    className={clsx('px-2 py-0.5 rounded text-xs font-medium transition-colors',
                      limit === n ? 'bg-[#FF5706] text-white' : 'text-slate-500 hover:bg-slate-100')}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg disabled:opacity-30"><ChevronLeft size={15} /></button>
              <span className="px-3 py-1 text-xs font-medium text-slate-600">
                Página {page} de {Math.ceil(total / limit)}
              </span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / limit)}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg disabled:opacity-30"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Criar contato ─────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-bold text-slate-900">Novo Contato</h2>
              <button onClick={closeCreate} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="flex border-b border-slate-100 flex-shrink-0">
              <button onClick={() => setCreateTab('individual')}
                className={clsx('flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-all',
                  createTab === 'individual' ? 'border-[#FF5706] text-[#FF5706]' : 'border-transparent text-slate-400 hover:text-slate-600')}>
                <UserPlus size={15} /> Individual
              </button>
              <button onClick={() => setCreateTab('tabela')}
                className={clsx('flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-all',
                  createTab === 'tabela' ? 'border-[#FF5706] text-[#FF5706]' : 'border-transparent text-slate-400 hover:text-slate-600')}>
                <ClipboardList size={15} /> Colar tabela
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {createTab === 'individual' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Nome</label>
                      <input placeholder="João Silva" value={singleForm.nome}
                        onChange={e => setSingleForm(f => ({ ...f, nome: e.target.value }))} className="input" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Telefone *</label>
                      <input placeholder="+5511999999999" value={singleForm.telefone}
                        onChange={e => setSingleForm(f => ({ ...f, telefone: normalizePhoneInput(e.target.value) }))}
                        className="input font-mono" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">E-mail (opcional)</label>
                      <input placeholder="joao@exemplo.com" value={singleForm.email}
                        onChange={e => setSingleForm(f => ({ ...f, email: e.target.value }))} className="input" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Origem</label>
                      <select value={singleForm.origem} onChange={e => setSingleForm(f => ({ ...f, origem: e.target.value }))} className="input">
                        {['manual','indicacao','site','instagram','whatsapp','linkedin','outro'].map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">TAGs</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {singleTags.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 text-xs bg-[#FFF3EC] text-[#FF5706] px-2.5 py-1 rounded-full font-medium">
                          {t}<button type="button" onClick={() => removeSingleTag(t)} className="hover:text-red-500"><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input list="tags-create" placeholder="Digite ou selecione uma TAG..." value={singleForm.newTag}
                          onChange={e => setSingleForm(f => ({ ...f, newTag: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSingleTag(singleForm.newTag); } }}
                          className="input" />
                        <datalist id="tags-create">{(existingTags as string[]).map(t => <option key={t} value={t} />)}</datalist>
                      </div>
                      <button type="button" onClick={() => addSingleTag(singleForm.newTag)} className="btn-ghost px-3">Adicionar</button>
                    </div>
                  </div>
                </div>
              )}
              {createTab === 'tabela' && (
                <div className="space-y-4">
                  {!parsedTable ? (
                    <>
                      <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 space-y-1">
                        <p className="font-medium text-slate-600">Como usar:</p>
                        <p>1. Copie a tabela do Excel ou Google Sheets (Ctrl+C)</p>
                        <p>2. Cole no campo abaixo (Ctrl+V)</p>
                        <p>3. Se a primeira linha for cabeçalho com "nome", "telefone", "tag" — será detectada automaticamente</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">Cole os dados aqui</label>
                        <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
                          onPaste={e => { setTimeout(() => { const t = e.currentTarget.value; if (t) { setPasteText(t); setTimeout(handleParse, 50); } }, 10); }}
                          placeholder={"Nome\tTelefone\tTag\nJoão Silva\t11999999999\tlead"} rows={8}
                          className="input resize-none font-mono text-xs" />
                      </div>
                      <button onClick={handleParse} disabled={!pasteText.trim()} className="btn-primary w-full justify-center">Analisar dados</button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-700">{parsedTable.rows.length} contato{parsedTable.rows.length !== 1 ? 's' : ''} detectado{parsedTable.rows.length !== 1 ? 's' : ''}</p>
                        <button onClick={() => setParsedTable(null)} className="text-xs text-slate-400 hover:text-slate-600">← Editar</button>
                      </div>
                      <div className="overflow-auto max-h-52 rounded-xl border border-slate-200">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 sticky top-0">
                            <tr>{parsedTable.headers.map((h, i) => <th key={i} className="text-left px-3 py-2 text-slate-500 font-semibold">{h}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {parsedTable.rows.slice(0, 20).map((row, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                {row.map((cell, j) => <td key={j} className="px-3 py-1.5 text-slate-600">{cell}</td>)}
                              </tr>
                            ))}
                            {parsedTable.rows.length > 20 && (
                              <tr><td colSpan={parsedTable.headers.length} className="px-3 py-2 text-center text-slate-400">+ {parsedTable.rows.length - 20} mais...</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">Adicionar TAG a todos (opcional)</label>
                        <input list="tags-bulk" placeholder="Ex: lead, clientes-maio" value={globalTag} onChange={e => setGlobalTag(e.target.value)} className="input" />
                        <datalist id="tags-bulk">{(existingTags as string[]).map(t => <option key={t} value={t} />)}</datalist>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end px-6 pb-6 pt-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={closeCreate} className="btn-ghost">Cancelar</button>
              {createTab === 'individual' ? (
                <button onClick={() => createOneMut.mutate({ ...singleForm, tags: singleTags })}
                  disabled={!singleForm.telefone || createOneMut.isLoading} className="btn-primary">
                  {createOneMut.isLoading ? 'Salvando...' : 'Criar Contato'}
                </button>
              ) : (
                <button onClick={handleBulkImport} disabled={!parsedTable || createBulkMut.isLoading} className="btn-primary">
                  {createBulkMut.isLoading ? 'Importando...' : parsedTable ? `Importar ${parsedTable.rows.length} contato${parsedTable.rows.length !== 1 ? 's' : ''}` : 'Importar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar contato ─────────────────────────────── */}
      {editContact && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-bold text-slate-900">Editar Contato</h2>
              <button onClick={() => setEditContact(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Nome</label>
                  <input placeholder="João Silva" value={editForm.nome}
                    onChange={e => setEditForm((f: any) => ({ ...f, nome: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Telefone</label>
                  <input placeholder="+5511999999999" value={editForm.telefone}
                    onChange={e => setEditForm((f: any) => ({ ...f, telefone: normalizePhoneInput(e.target.value) }))}
                    className="input font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">E-mail</label>
                  <input placeholder="joao@exemplo.com" value={editForm.email}
                    onChange={e => setEditForm((f: any) => ({ ...f, email: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Origem</label>
                  <select value={editForm.origem} onChange={e => setEditForm((f: any) => ({ ...f, origem: e.target.value }))} className="input">
                    {['manual','indicacao','site','instagram','whatsapp','linkedin','outro'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Status</label>
                <select value={editForm.status_contato} onChange={e => setEditForm((f: any) => ({ ...f, status_contato: e.target.value }))} className="input">
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Curso</label>
                  <input placeholder="Ex: Direito" value={editForm.curso}
                    onChange={e => setEditForm((f: any) => ({ ...f, curso: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Categoria</label>
                  <input placeholder="Ex: Lead quente" value={editForm.categoria}
                    onChange={e => setEditForm((f: any) => ({ ...f, categoria: e.target.value }))} className="input" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">TAGs</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editTags.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-medium">
                      {t}<button type="button" onClick={() => removeEditTag(t)} className="hover:text-red-500"><X size={10} /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input list="tags-edit" placeholder="Digite ou selecione uma TAG..." value={editNewTag}
                      onChange={e => setEditNewTag(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditTag(editNewTag); } }}
                      className="input" />
                    <datalist id="tags-edit">{(existingTags as string[]).map(t => <option key={t} value={t} />)}</datalist>
                  </div>
                  <button type="button" onClick={() => addEditTag(editNewTag)} className="btn-ghost px-3">Adicionar</button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end px-6 pb-6 pt-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => setEditContact(null)} className="btn-ghost">Cancelar</button>
              <button
                onClick={() => editMut.mutate({ id: editContact.id, data: { ...editForm, tags: editTags } })}
                disabled={editMut.isLoading}
                className="btn-primary"
              >
                {editMut.isLoading ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar exclusão individual ─────────────── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Excluir contato?</h3>
                <p className="text-xs text-slate-400 mt-0.5">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="btn-ghost">Cancelar</button>
              <button
                onClick={() => deleteMut.mutate(deleteId)}
                disabled={deleteMut.isLoading}
                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-xl transition-all text-sm"
              >
                {deleteMut.isLoading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar exclusão em massa ───────────────── */}
      {showBulkDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Excluir {selected.size} contato{selected.size !== 1 ? 's' : ''}?</h3>
                <p className="text-xs text-slate-400 mt-0.5">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowBulkDelete(false)} className="btn-ghost">Cancelar</button>
              <button
                onClick={() => bulkDeleteMut.mutate(Array.from(selected))}
                disabled={bulkDeleteMut.isLoading}
                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-xl transition-all text-sm"
              >
                {bulkDeleteMut.isLoading ? 'Excluindo...' : `Excluir ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
