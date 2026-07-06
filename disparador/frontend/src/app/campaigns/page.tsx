'use client';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { campaignsApi, sessionsApi, contactsApi } from '@/lib/api';
import {
  Plus, Play, Pause, Copy, ChevronRight, Megaphone, X,
  Clock, CalendarDays, Tag, Smartphone, MessageSquare,
  Image, Video, Mic, FileText, Sparkles, Trash2,
  ChevronUp, ChevronDown, CheckSquare, Square, Send, BookmarkCheck,
} from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import DragUpload from '@/components/ui/DragUpload';

// ── Types ─────────────────────────────────────────────────
type MsgTipo = 'texto' | 'imagem' | 'video' | 'audio' | 'arquivo' | 'ia';

interface Mensagem {
  tipo: MsgTipo;
  conteudo?: string;
  prompt?: string;
  tom_ia?: string;
  url?: string;
  legenda?: string;
  nome_arquivo?: string;
}

// ── Constants ──────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  rascunho:             'bg-slate-100 text-slate-600',
  aguardando_aprovacao: 'bg-amber-100 text-amber-700',
  aprovada:             'bg-blue-100 text-blue-700',
  em_execucao:          'bg-[#FFF3EC] text-[#FF5706]',
  pausada:              'bg-orange-100 text-orange-700',
  encerrada:            'bg-slate-100 text-slate-500',
  bloqueada_por_risco:  'bg-red-100 text-red-700',
  erro:                 'bg-red-100 text-red-600',
};

const STATUS_LABEL: Record<string, string> = {
  rascunho:             'Rascunho',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovada:             'Aprovada',
  em_execucao:          'Em execução',
  pausada:              'Pausada',
  encerrada:            'Encerrada',
  bloqueada_por_risco:  'Bloqueada',
  erro:                 'Erro',
};

const RISK_COLORS: Record<string, string> = {
  baixo: 'text-[#10B981] bg-[#F0FDF4]',
  medio: 'text-amber-600 bg-amber-50',
  alto:  'text-red-600 bg-red-50',
};

const TONS = ['consultivo','comercial_leve','educacional','institucional','amigavel','objetivo','reativacao','followup'];
const VARS = ['{{nome}}', '{{telefone}}', '{{curso}}', '{{categoria}}'];

const MSG_TIPOS: { value: MsgTipo; label: string; Icon: any }[] = [
  { value: 'texto',   label: 'Texto',        Icon: MessageSquare },
  { value: 'imagem',  label: 'Imagem',        Icon: Image },
  { value: 'video',   label: 'Vídeo',         Icon: Video },
  { value: 'audio',   label: 'Áudio',         Icon: Mic },
  { value: 'arquivo', label: 'Arquivo',        Icon: FileText },
  { value: 'ia',      label: 'Gerado por IA', Icon: Sparkles },
];

const EMPTY_FORM = () => ({
  nome: '',
  objetivo: '',
  tom: 'consultivo',
  limite_diario: 50,
  session_ids:   [] as string[],
  intervalo_min: 10,
  intervalo_max: 30,
  janela_inicio: '00:00',
  janela_fim:    '23:59',
  agendamento:   '',
  tags_filtro:   [] as string[],
  mensagens:     [{ tipo: 'texto' as MsgTipo, conteudo: '' }] as Mensagem[],
});

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-slate-400" />
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────
export default function CampaignsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM());
  const [isScheduled, setIsScheduled] = useState(false);
  const [isSending, setIsSending]     = useState(false);
  const [sendError, setSendError]     = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const { data, isLoading } = useQuery('campaigns', () =>
    campaignsApi.list().then(r => r.data), { refetchInterval: 8000 });

  const { data: sessionsRaw = [] } = useQuery('sessions-for-campaign', () =>
    sessionsApi.list().then(r => r.data ?? []), { enabled: showForm });

  const { data: availableTags = [] } = useQuery('contact-tags', () =>
    contactsApi.tags().then(r => r.data ?? []), { enabled: showForm });

  const sessions: any[] = Array.isArray(sessionsRaw) ? sessionsRaw : [];
  const campaigns: any[] = data?.data || [];

  // ── Mutations ──────────────────────────────────────────────
  const createMut  = useMutation((body: any) => campaignsApi.create(body).then(r => r.data));
  const approveMut = useMutation((id: string) => campaignsApi.approve(id));
  const startMut   = useMutation((id: string) => campaignsApi.start(id),     { onSuccess: () => qc.invalidateQueries('campaigns') });
  const pauseMut   = useMutation((id: string) => campaignsApi.pause(id),     { onSuccess: () => qc.invalidateQueries('campaigns') });
  const dupMut     = useMutation((id: string) => campaignsApi.duplicate(id), { onSuccess: () => qc.invalidateQueries('campaigns') });
  const [deleteError, setDeleteError] = useState('');
  const deleteMut  = useMutation((id: string) => campaignsApi.delete(id),    {
    onSuccess: () => { qc.invalidateQueries('campaigns'); setDeleteConfirm(null); setDeleteError(''); },
    onError: (err: any) => setDeleteError(err?.response?.data?.message || err?.message || 'Erro ao excluir'),
  });

  const closeForm = () => {
    setShowForm(false); setForm(EMPTY_FORM()); setIsScheduled(false);
    setSendError(''); setIsSending(false);
  };

  // ── Build payload ────────────────────────────────────────
  const buildPayload = () => ({
    ...form,
    mensagem_base: '',
    agendamento: isScheduled && form.agendamento ? form.agendamento : null,
    tags_filtro: form.tags_filtro.length ? form.tags_filtro : null,
  });

  // ── Save as draft ────────────────────────────────────────
  const handleSaveDraft = async () => {
    setSendError('');
    try {
      await createMut.mutateAsync(buildPayload());
      qc.invalidateQueries('campaigns');
      closeForm();
    } catch (e: any) {
      setSendError(e?.response?.data?.message || 'Erro ao salvar');
    }
  };

  // ── Create → Start (start auto-aprova rascunho) ──────────
  const handleSendNow = async () => {
    setSendError('');
    setIsSending(true);
    try {
      const campaign = await createMut.mutateAsync(buildPayload());
      await startMut.mutateAsync(campaign.id);
      qc.invalidateQueries('campaigns');
      closeForm();
    } catch (e: any) {
      setSendError(e?.response?.data?.message || 'Erro ao iniciar campanha');
      setIsSending(false);
    }
  };

  // ── Sessions toggle ───────────────────────────────────────
  const toggleSession = (id: string) =>
    setForm(f => ({
      ...f,
      session_ids: f.session_ids.includes(id)
        ? f.session_ids.filter(i => i !== id)
        : [...f.session_ids, id],
    }));

  // ── Tags filter toggle ────────────────────────────────────
  const toggleTagFiltro = (tag: string) =>
    setForm(f => ({
      ...f,
      tags_filtro: f.tags_filtro.includes(tag)
        ? f.tags_filtro.filter(t => t !== tag)
        : [...f.tags_filtro, tag],
    }));

  // ── Messages helpers ──────────────────────────────────────
  const addMsg = () => setForm(f => ({ ...f, mensagens: [...f.mensagens, { tipo: 'texto', conteudo: '' }] }));

  const removeMsg = (idx: number) =>
    setForm(f => ({ ...f, mensagens: f.mensagens.filter((_, i) => i !== idx) }));

  const moveMsg = (idx: number, dir: -1 | 1) => {
    const msgs = [...form.mensagens];
    const target = idx + dir;
    if (target < 0 || target >= msgs.length) return;
    [msgs[idx], msgs[target]] = [msgs[target], msgs[idx]];
    setForm(f => ({ ...f, mensagens: msgs }));
  };

  const updateMsg = (idx: number, field: keyof Mensagem, value: string) =>
    setForm(f => {
      const msgs = [...f.mensagens];
      msgs[idx] = { ...msgs[idx], [field]: value };
      return { ...f, mensagens: msgs };
    });

  const changeMsgTipo = (idx: number, tipo: MsgTipo) =>
    setForm(f => {
      const msgs = [...f.mensagens];
      msgs[idx] = { tipo };
      return { ...f, mensagens: msgs };
    });

  const insertVar = (idx: number, variable: string) => {
    const msg = form.mensagens[idx];
    const field = msg.tipo === 'ia' ? 'prompt' : 'conteudo';
    const el = textareaRefs.current[idx];
    const current = ((msg as any)[field] as string) || '';
    const start = el?.selectionStart ?? current.length;
    const end   = el?.selectionEnd   ?? current.length;
    const newVal = current.substring(0, start) + variable + current.substring(end);
    updateMsg(idx, field as keyof Mensagem, newVal);
    setTimeout(() => {
      if (el) { el.selectionStart = el.selectionEnd = start + variable.length; el.focus(); }
    }, 0);
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Campanhas</h1>
          <p className="text-slate-400 text-sm mt-1">Gerencie e monitore suas campanhas de disparo</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> Nova Campanha
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nome</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Enviados</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Respostas</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Risco</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <Megaphone size={32} className="mx-auto text-slate-200 mb-3" />
                  <p className="text-slate-400 text-sm">Nenhuma campanha criada ainda</p>
                  <button onClick={() => setShowForm(true)} className="btn-primary mt-4 mx-auto">
                    <Plus size={14} /> Criar primeira campanha
                  </button>
                </td>
              </tr>
            )}
            {campaigns.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-5 py-3.5">
                  <p className="font-semibold text-slate-900">{c.nome}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.objetivo}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span className={clsx('badge', STATUS_COLORS[c.status])}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-700 font-medium tabular-nums">
                  {(c.campaign_metrics?.[0]?.total_enviados ?? 0).toLocaleString('pt-BR')}
                </td>
                <td className="px-5 py-3.5 text-slate-700 font-medium tabular-nums">
                  {(c.campaign_metrics?.[0]?.total_respostas ?? 0).toLocaleString('pt-BR')}
                </td>
                <td className="px-5 py-3.5">
                  {c.nivel_risco && (
                    <span className={clsx('badge', RISK_COLORS[c.nivel_risco] ?? 'text-slate-500 bg-slate-50')}>{c.nivel_risco}</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1 justify-end">
                    {/* Rascunho → Enviar */}
                    {c.status === 'rascunho' && (
                      <button
                        onClick={() => startMut.mutate(c.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#FF5706] hover:bg-[#E84B00] text-white rounded-lg transition-colors"
                      >
                        <Send size={11} /> Enviar
                      </button>
                    )}
                    {/* Aprovada ou pausada → Iniciar */}
                    {(c.status === 'aprovada' || c.status === 'pausada') && (
                      <button onClick={() => startMut.mutate(c.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#FF5706] hover:bg-[#E84B00] text-white rounded-lg transition-colors">
                        <Play size={11} /> Iniciar
                      </button>
                    )}
                    {/* Em execução → Pausar */}
                    {c.status === 'em_execucao' && (
                      <button onClick={() => pauseMut.mutate(c.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-orange-100 hover:bg-orange-200 text-orange-600 rounded-lg transition-colors">
                        <Pause size={11} /> Pausar
                      </button>
                    )}
                    <button onClick={() => dupMut.mutate(c.id)}
                      className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg" title="Duplicar">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => setDeleteConfirm(c.id)}
                      className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg" title="Excluir">
                      <Trash2 size={14} />
                    </button>
                    <Link href={`/campaigns/${c.id}`} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                      <ChevronRight size={14} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Confirmar exclusão ────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Excluir campanha?</h3>
                <p className="text-xs text-slate-400 mt-0.5">Esta ação não pode ser desfeita. Jobs pendentes serão cancelados.</p>
              </div>
            </div>
            {deleteError && <p className="text-xs text-red-500 bg-red-50 rounded-lg p-2">{deleteError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setDeleteConfirm(null); setDeleteError(''); }} className="btn-ghost">Cancelar</button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm)}
                disabled={deleteMut.isLoading}
                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-xl transition-all text-sm"
              >
                {deleteMut.isLoading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer: Nova Campanha ────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={closeForm} />

          <div className="w-full max-w-2xl bg-white flex flex-col h-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900">Nova Campanha</h2>
                <p className="text-xs text-slate-400 mt-0.5">Configure e salve ou envie imediatamente</p>
              </div>
              <button onClick={closeForm} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-7 py-6 space-y-8">

              {/* 1. Identificação */}
              <Section icon={Megaphone} title="Identificação">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Nome da campanha</label>
                    <input placeholder="Ex: Reativação Maio" value={form.nome}
                      onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="input" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Objetivo</label>
                    <input placeholder="Ex: vendas, reativação, prospecção" value={form.objetivo}
                      onChange={e => setForm(f => ({ ...f, objetivo: e.target.value }))} className="input" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Tom</label>
                      <select value={form.tom} onChange={e => setForm(f => ({ ...f, tom: e.target.value }))} className="input">
                        {TONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Limite diário de envios</label>
                      <input type="number" min={1} value={form.limite_diario}
                        onChange={e => setForm(f => ({ ...f, limite_diario: +e.target.value }))} className="input" />
                    </div>
                  </div>
                </div>
              </Section>

              {/* 2. Instâncias */}
              <Section icon={Smartphone} title="Instâncias de disparo">
                <p className="text-xs text-slate-400 mb-3">Selecione uma ou mais — o envio será distribuído aleatoriamente.</p>
                {sessions.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2.5">
                    Nenhuma instância conectada. Vá em <strong>Sessões WAHA</strong> e conecte primeiro.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((s: any) => {
                      const selected = form.session_ids.includes(s.id);
                      return (
                        <button key={s.id} type="button" onClick={() => toggleSession(s.id)}
                          className={clsx(
                            'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all',
                            selected ? 'border-[#FF8754] bg-[#FFF3EC]' : 'border-slate-200 bg-white hover:border-slate-300',
                          )}>
                          {selected
                            ? <CheckSquare size={16} className="text-[#FF5706] flex-shrink-0" />
                            : <Square size={16} className="text-slate-300 flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className={clsx('text-sm font-medium', selected ? 'text-[#E84B00]' : 'text-slate-700')}>{s.nome_sessao}</p>
                            <p className="text-xs text-slate-400">{s.telefone || 'Sem telefone'}</p>
                          </div>
                          <span className="text-[10px] font-semibold text-[#FF5706] bg-[#FFF3EC] px-2 py-0.5 rounded-full">conectada</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Section>

              {/* 3. Temporização */}
              <Section icon={Clock} title="Intervalo entre disparos">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Mínimo (segundos)</label>
                      <input type="number" min={1} value={form.intervalo_min}
                        onChange={e => setForm(f => ({ ...f, intervalo_min: +e.target.value }))} className="input" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Máximo (segundos)</label>
                      <input type="number" min={1} value={form.intervalo_max}
                        onChange={e => setForm(f => ({ ...f, intervalo_max: +e.target.value }))} className="input" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Intervalo sorteado aleatoriamente entre {form.intervalo_min}s e {form.intervalo_max}s a cada envio.
                  </p>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Janela de envio (horário permitido)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Das</label>
                        <input type="time" value={form.janela_inicio}
                          onChange={e => setForm(f => ({ ...f, janela_inicio: e.target.value }))} className="input" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Até</label>
                        <input type="time" value={form.janela_fim}
                          onChange={e => setForm(f => ({ ...f, janela_fim: e.target.value }))} className="input" />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">Mensagens só serão enviadas dentro deste horário. Use 00:00–23:59 para enviar a qualquer hora.</p>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIsScheduled(false)}
                      className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all',
                        !isScheduled ? 'border-[#FF8754] bg-[#FFF3EC] text-[#FF5706]' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                      <Play size={14} /> Disparar imediatamente
                    </button>
                    <button type="button" onClick={() => setIsScheduled(true)}
                      className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all',
                        isScheduled ? 'border-[#FF8754] bg-[#FFF3EC] text-[#FF5706]' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                      <CalendarDays size={14} /> Agendar disparo
                    </button>
                  </div>
                  {isScheduled && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Data e horário</label>
                      <input type="datetime-local" value={form.agendamento}
                        onChange={e => setForm(f => ({ ...f, agendamento: e.target.value }))} className="input" />
                    </div>
                  )}
                </div>
              </Section>

              {/* 4. Filtro de público — multi-tag */}
              <Section icon={Tag} title="Filtro de público">
                {(availableTags as string[]).length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2.5">
                    Nenhuma TAG cadastrada ainda. Adicione TAGs aos contatos para filtrar por público.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-400 mb-3">
                      Selecione uma ou mais TAGs — serão enviados contatos que possuem qualquer uma delas. Vazio = todos.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(availableTags as string[]).map(tag => {
                        const selected = form.tags_filtro.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTagFiltro(tag)}
                            className={clsx(
                              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                              selected
                                ? 'border-[#FF8754] bg-[#FFF3EC] text-[#FF5706]'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300',
                            )}
                          >
                            {selected && <CheckSquare size={12} />}
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                    {form.tags_filtro.length > 0 && (
                      <p className="text-[11px] text-[#FF5706] mt-2">
                        Filtrando por: {form.tags_filtro.join(', ')}
                      </p>
                    )}
                  </>
                )}
              </Section>

              {/* 5. Mensagens */}
              <Section icon={MessageSquare} title="Sequência de mensagens">
                <p className="text-xs text-slate-400 mb-3">
                  Enviadas em sequência para cada contato com o intervalo configurado acima.
                </p>
                <div className="space-y-3">
                  {form.mensagens.map((msg, idx) => {
                    const MsgIcon = MSG_TIPOS.find(m => m.value === msg.tipo)?.Icon ?? MessageSquare;
                    const hasVars = msg.tipo === 'texto' || msg.tipo === 'ia';

                    return (
                      <div key={idx} className="border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                          <span className="text-xs font-semibold text-slate-400 w-5 text-center">{idx + 1}</span>
                          <MsgIcon size={14} className="text-slate-400" />
                          <select value={msg.tipo} onChange={e => changeMsgTipo(idx, e.target.value as MsgTipo)}
                            className="flex-1 bg-transparent text-xs font-medium text-slate-600 outline-none cursor-pointer">
                            {MSG_TIPOS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <div className="flex items-center gap-1 ml-auto">
                            <button type="button" onClick={() => moveMsg(idx, -1)} disabled={idx === 0}
                              className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronUp size={13} /></button>
                            <button type="button" onClick={() => moveMsg(idx, 1)} disabled={idx === form.mensagens.length - 1}
                              className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronDown size={13} /></button>
                            <button type="button" onClick={() => removeMsg(idx)} disabled={form.mensagens.length === 1}
                              className="p-1 text-red-400 hover:text-red-500 disabled:opacity-30"><Trash2 size={13} /></button>
                          </div>
                        </div>

                        <div className="p-4 space-y-3">
                          {msg.tipo === 'texto' && (
                            <textarea ref={el => { textareaRefs.current[idx] = el; }}
                              placeholder="Digite a mensagem... Use {{nome}}, {{curso}} etc."
                              value={msg.conteudo || ''} onChange={e => updateMsg(idx, 'conteudo', e.target.value)}
                              rows={3} className="input resize-none text-sm" />
                          )}

                          {(['imagem', 'video', 'audio', 'arquivo'] as MsgTipo[]).includes(msg.tipo) && (
                            <>
                              <DragUpload mediaType={msg.tipo as any} value={msg.url}
                                onUpload={url => updateMsg(idx, 'url', url)}
                                onClear={() => updateMsg(idx, 'url', '')} />
                              {msg.tipo === 'imagem' && (
                                <input placeholder="Legenda (opcional)" value={msg.legenda || ''}
                                  onChange={e => updateMsg(idx, 'legenda', e.target.value)} className="input text-sm" />
                              )}
                              {msg.tipo === 'arquivo' && (
                                <input placeholder="Nome do arquivo (ex: catalogo.pdf)" value={msg.nome_arquivo || ''}
                                  onChange={e => updateMsg(idx, 'nome_arquivo', e.target.value)} className="input text-sm" />
                              )}
                            </>
                          )}

                          {msg.tipo === 'ia' && (
                            <>
                              <textarea ref={el => { textareaRefs.current[idx] = el; }}
                                placeholder="Ex: Crie uma mensagem de reativação para {{nome}}..."
                                value={msg.prompt || ''} onChange={e => updateMsg(idx, 'prompt', e.target.value)}
                                rows={3} className="input resize-none text-sm" />
                              <select value={msg.tom_ia || 'consultivo'}
                                onChange={e => updateMsg(idx, 'tom_ia', e.target.value)} className="input text-sm">
                                {TONS.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </>
                          )}

                          {hasVars && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-slate-400 font-medium">Inserir variável:</span>
                              {VARS.map(v => (
                                <button key={v} type="button" onClick={() => insertVar(idx, v)}
                                  className="text-[10px] font-mono bg-slate-100 hover:bg-[#FFF3EC] hover:text-[#FF5706] text-slate-600 px-2 py-0.5 rounded transition-colors">
                                  {v}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button type="button" onClick={addMsg}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 hover:border-[#FF8754] hover:text-[#FF5706] text-slate-400 text-xs font-medium rounded-2xl transition-all">
                  <Plus size={14} /> Adicionar mensagem
                </button>
              </Section>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-7 py-5 border-t border-slate-100 bg-slate-50/40 space-y-3">
              {sendError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{sendError}</p>
              )}
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  {form.session_ids.length === 0
                    ? 'Nenhuma instância selecionada'
                    : `${form.session_ids.length} instância${form.session_ids.length > 1 ? 's' : ''} · ${form.mensagens.length} mensagem${form.mensagens.length > 1 ? 's' : ''}`}
                  {form.tags_filtro.length > 0 && ` · ${form.tags_filtro.length} tag${form.tags_filtro.length > 1 ? 's' : ''}`}
                </p>
                <div className="flex gap-2">
                  <button onClick={closeForm} className="btn-ghost">Cancelar</button>
                  <button
                    onClick={handleSaveDraft}
                    disabled={!form.nome || createMut.isLoading || isSending}
                    className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 rounded-xl transition-all text-sm disabled:opacity-50"
                  >
                    <BookmarkCheck size={14} />
                    {createMut.isLoading && !isSending ? 'Salvando...' : 'Salvar rascunho'}
                  </button>
                  <button
                    onClick={handleSendNow}
                    disabled={!form.nome || form.session_ids.length === 0 || isSending || createMut.isLoading}
                    className="btn-primary disabled:opacity-50"
                    title={form.session_ids.length === 0 ? 'Selecione ao menos uma instância' : ''}
                  >
                    <Send size={14} />
                    {isSending ? 'Enviando...' : 'Enviar agora'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
