'use client';
import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { campaignsApi } from '@/lib/api';
import {
  ArrowLeft, Play, Pause, StopCircle, Trash2, Copy,
  CheckCircle2, XCircle, Clock, Send, AlertCircle, Users, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';

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
  rascunho: 'Rascunho', aguardando_aprovacao: 'Aguardando aprovação',
  aprovada: 'Aprovada', em_execucao: 'Em execução',
  pausada: 'Pausada', encerrada: 'Encerrada',
  bloqueada_por_risco: 'Bloqueada', erro: 'Erro',
};

const QUEUE_STATUS_ICON: Record<string, any> = {
  enviado:  { Icon: CheckCircle2, cls: 'text-[#10B981]' },
  enviando: { Icon: Send,         cls: 'text-[#FF5706] animate-pulse' },
  agendado: { Icon: Clock,        cls: 'text-slate-400' },
  pendente: { Icon: Clock,        cls: 'text-slate-400' },
  erro:     { Icon: XCircle,      cls: 'text-red-500' },
  pausado:  { Icon: Pause,        cls: 'text-orange-400' },
  cancelado:{ Icon: XCircle,      cls: 'text-slate-300' },
};

function StatCard({ label, value, sub, color }: { label: string; value: any; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={clsx('text-2xl font-bold tabular-nums', color || 'text-slate-900')}>{value ?? 0}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: campaign, isLoading } = useQuery(
    ['campaign', id],
    () => campaignsApi.get(id).then(r => r.data),
    { refetchInterval: 5000 },
  );

  const { data: queueSummary = {} } = useQuery(
    ['queue-status', id],
    () => campaignsApi.queueStatus(id).then(r => r.data),
    { refetchInterval: 5000, enabled: !!id },
  );

  const { data: queueItems = [] } = useQuery(
    ['queue-details', id],
    () => campaignsApi.queueDetails(id).then(r => r.data),
    { refetchInterval: 8000, enabled: !!id },
  );

  const [requeueError, setRequeueError] = useState('');
  const [queueFontSize, setQueueFontSize] = useState(13);
  const [queueView, setQueueView] = useState<'agrupado' | 'cronologico'>('agrupado');
  const [editingWindow, setEditingWindow] = useState(false);

  // Agrupa itens por contato preservando ordem de primeiro envio
  const groupedQueue = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of queueItems as any[]) {
      const key = item.contact_id || item.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.values());
  }, [queueItems]);
  const [windowForm, setWindowForm] = useState({ janela_inicio: '', janela_fim: '' });

  const startMut   = useMutation(() => campaignsApi.start(id),   { onSuccess: () => qc.invalidateQueries(['campaign', id]) });
  const pauseMut   = useMutation(() => campaignsApi.pause(id),   { onSuccess: () => qc.invalidateQueries(['campaign', id]) });
  const stopMut    = useMutation(() => campaignsApi.stop(id),    { onSuccess: () => qc.invalidateQueries(['campaign', id]) });
  const dupMut     = useMutation(() => campaignsApi.duplicate(id), { onSuccess: () => router.push('/campaigns') });
  const deleteMut  = useMutation(() => campaignsApi.delete(id),  { onSuccess: () => router.push('/campaigns') });
  const updateMut  = useMutation((data: any) => campaignsApi.update(id, data), { onSuccess: () => { qc.invalidateQueries(['campaign', id]); setEditingWindow(false); } });
  const requeueMut = useMutation(() => campaignsApi.requeue(id), {
    onSuccess: () => { setRequeueError(''); qc.invalidateQueries(['queue-status', id]); qc.invalidateQueries(['queue-details', id]); },
    onError: (e: any) => setRequeueError(e?.response?.data?.message || 'Erro ao reenfileirar'),
  });

  const metrics = campaign?.campaign_metrics?.[0] ?? {};
  const totalEnqueued = Object.values(queueSummary as Record<string, number>).reduce((a: any, b: any) => a + b, 0);
  const totalSent = (queueSummary as any).enviado || 0;
  const totalError = (queueSummary as any).erro || 0;
  const totalPending = ((queueSummary as any).agendado || 0) + ((queueSummary as any).pendente || 0);

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="h-8 bg-slate-100 rounded-xl animate-pulse w-64" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p>Campanha não encontrada.</p>
        <Link href="/campaigns" className="text-[#FF5706] text-sm mt-2 inline-block">← Voltar</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/campaigns" className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{campaign.nome}</h1>
              <span className={clsx('badge', STATUS_COLORS[campaign.status])}>
                {STATUS_LABEL[campaign.status] ?? campaign.status}
              </span>
            </div>
            {campaign.objetivo && <p className="text-slate-400 text-sm mt-0.5">{campaign.objetivo}</p>}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {['rascunho', 'aprovada', 'pausada'].includes(campaign.status) && (
            <button onClick={() => startMut.mutate()} disabled={startMut.isLoading}
              className="inline-flex items-center gap-2 bg-[#FF5706] hover:bg-[#E84B00] disabled:opacity-50 text-white font-medium px-4 py-2 rounded-xl text-sm transition-all">
              <Play size={14} /> {startMut.isLoading ? 'Iniciando...' : 'Iniciar'}
            </button>
          )}
          {campaign.status === 'em_execucao' && (
            <button onClick={() => pauseMut.mutate()} disabled={pauseMut.isLoading}
              className="inline-flex items-center gap-2 bg-orange-100 hover:bg-orange-200 text-orange-600 font-medium px-4 py-2 rounded-xl text-sm transition-all">
              <Pause size={14} /> Pausar
            </button>
          )}
          {['em_execucao', 'pausada'].includes(campaign.status) && (
            <button onClick={() => stopMut.mutate()} disabled={stopMut.isLoading}
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium px-4 py-2 rounded-xl text-sm transition-all">
              <StopCircle size={14} /> Encerrar
            </button>
          )}
          <button
            onClick={() => requeueMut.mutate()}
            disabled={requeueMut.isLoading}
            className="inline-flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium px-3 py-2 rounded-xl text-sm transition-all disabled:opacity-50"
            title="Cancelar pendentes e reenfileirar todos os contatos"
          >
            <RefreshCw size={14} className={requeueMut.isLoading ? 'animate-spin' : ''} />
            {requeueMut.isLoading ? 'Reenfileirando...' : 'Reenfileirar'}
          </button>
          <button onClick={() => dupMut.mutate()}
            className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl" title="Duplicar">
            <Copy size={16} />
          </button>
          <button onClick={() => setShowDeleteConfirm(true)}
            className="p-2 text-red-400 hover:bg-red-50 rounded-xl" title="Excluir">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Requeue error */}
      {requeueError && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
          {requeueError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Enviados" value={totalSent.toLocaleString('pt-BR')} color="text-[#10B981]" />
        <StatCard label="Pendentes" value={totalPending.toLocaleString('pt-BR')} color="text-slate-600" />
        <StatCard label="Erros" value={totalError.toLocaleString('pt-BR')} color="text-red-500" />
        <StatCard label="Total fila" value={totalEnqueued.toLocaleString('pt-BR')} sub={`${metrics.total_contatos ?? 0} contatos`} />
      </div>

      {/* Progress bar */}
      {totalEnqueued > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">Progresso de envio</p>
            <p className="text-xs text-slate-400">{Math.round((totalSent / totalEnqueued) * 100)}%</p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-[#FF5706] h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.round((totalSent / totalEnqueued) * 100)}%` }}
            />
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#FF8754] inline-block" /> Enviado: {totalSent}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-200 inline-block" /> Pendente: {totalPending}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Erro: {totalError}</span>
          </div>
        </div>
      )}

      {/* Campaign info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Configurações</p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Intervalo</span>
              <span className="font-medium text-slate-800">{campaign.intervalo_min ?? 90}s – {campaign.intervalo_max ?? 300}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Limite diário</span>
              <span className="font-medium text-slate-800">{campaign.limite_diario ?? 50} mensagens</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tom</span>
              <span className="font-medium text-slate-800">{campaign.tom}</span>
            </div>
            {campaign.tags_filtro?.length > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Tags filtro</span>
                <span className="font-medium text-slate-800">{campaign.tags_filtro.join(', ')}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Mensagens</span>
              <span className="font-medium text-slate-800">{campaign.mensagens?.length ?? 0} na sequência</span>
            </div>

            {/* Janela de envio */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-500 text-sm">Janela de envio</span>
                {!editingWindow && (
                  <button
                    onClick={() => { setEditingWindow(true); setWindowForm({ janela_inicio: campaign.janela_inicio?.slice(0,5) || '00:00', janela_fim: campaign.janela_fim?.slice(0,5) || '23:59' }); }}
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                  >Editar</button>
                )}
              </div>
              {editingWindow ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400">Das</label>
                      <input type="time" value={windowForm.janela_inicio}
                        onChange={e => setWindowForm(f => ({ ...f, janela_inicio: e.target.value }))}
                        className="input mt-1" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">Até</label>
                      <input type="time" value={windowForm.janela_fim}
                        onChange={e => setWindowForm(f => ({ ...f, janela_fim: e.target.value }))}
                        className="input mt-1" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">Use 00:00–23:59 para enviar a qualquer hora.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingWindow(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
                    <button
                      onClick={() => updateMut.mutate({ janela_inicio: windowForm.janela_inicio, janela_fim: windowForm.janela_fim })}
                      disabled={updateMut.isLoading}
                      className="text-xs bg-[#FF5706] hover:bg-[#E84B00] text-white font-medium px-3 py-1 rounded-lg disabled:opacity-50"
                    >{updateMut.isLoading ? 'Salvando...' : 'Salvar'}</button>
                  </div>
                </div>
              ) : (
                <span className="font-medium text-slate-800">
                  {campaign.janela_inicio?.slice(0,5) || '00:00'} – {campaign.janela_fim?.slice(0,5) || '23:59'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Mensagens na sequência</p>
          {(!campaign.mensagens || campaign.mensagens.length === 0) ? (
            <p className="text-xs text-slate-400">Nenhuma mensagem configurada.</p>
          ) : (
            <div className="space-y-2">
              {campaign.mensagens.map((msg: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-xs font-semibold text-slate-400 w-5 flex-shrink-0 mt-0.5">{i + 1}.</span>
                  <div className="min-w-0">
                    <span className="badge bg-slate-100 text-slate-600 text-[10px] mr-2">{msg.tipo}</span>
                    <span className="text-slate-600 text-xs truncate">
                      {msg.tipo === 'ia' ? msg.prompt : (msg.conteudo || msg.url || '')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Queue items */}
      {(queueItems as any[]).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2 flex-wrap">
            <Users size={15} className="text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Fila de envio</p>
            <span className="ml-auto flex items-center gap-3">
              <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
                {(['agrupado', 'cronologico'] as const).map(v => (
                  <button key={v} onClick={() => setQueueView(v)}
                    className={clsx('px-2.5 py-1 font-medium transition-colors', queueView === v ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}>
                    {v === 'agrupado' ? 'Por contato' : 'Cronológico'}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400">{(queueItems as any[]).length} itens</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setQueueFontSize(s => Math.max(10, s - 1))}
                  className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-sm leading-none">−</button>
                <span className="text-xs text-slate-400 w-6 text-center tabular-nums">{queueFontSize}</span>
                <button onClick={() => setQueueFontSize(s => Math.min(20, s + 1))}
                  className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-sm leading-none">+</button>
              </div>
            </span>
          </div>

          {/* ── Vista cronológica ── */}
          {queueView === 'cronologico' && (
            <div className="divide-y divide-slate-50 max-h-[32rem] overflow-y-auto">
              {(queueItems as any[]).map((item: any, idx: number) => {
                const cfg = QUEUE_STATUS_ICON[item.status] || { Icon: AlertCircle, cls: 'text-slate-400' };
                const { Icon, cls } = cfg;
                const contact = item.contacts as any;
                const prev = idx > 0 ? (queueItems as any[])[idx - 1] : null;
                const getTs = (i: any) => i.sent_at || i.scheduled_at;
                const diff = prev && getTs(item) && getTs(prev)
                  ? Math.round((new Date(getTs(item)).getTime() - new Date(getTs(prev)).getTime()) / 1000) : null;
                return (
                  <div key={item.id}>
                    {diff !== null && diff > 0 && (
                      <div className="flex items-center gap-2 px-5 py-1">
                        <div className="h-px flex-1 bg-slate-100" />
                        <span className="text-xs text-slate-400 font-medium bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 tabular-nums">+{diff}s</span>
                        <div className="h-px flex-1 bg-slate-100" />
                      </div>
                    )}
                    <div className="px-5 py-3 flex items-center gap-3" style={{ fontSize: queueFontSize }}>
                      <Icon size={queueFontSize + 2} className={clsx('flex-shrink-0', cls)} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{contact?.nome || '—'}</p>
                        <p className="text-slate-400 font-mono" style={{ fontSize: queueFontSize - 2 }}>{contact?.telefone_normalizado || ''}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="badge bg-slate-50 text-slate-500" style={{ fontSize: queueFontSize - 3 }}>{item.tipo}</span>
                        {item.sent_at && <p className="text-[#10B981] mt-0.5" style={{ fontSize: queueFontSize - 3 }}>Enviado {new Date(item.sent_at).toLocaleTimeString('pt-BR')}</p>}
                        {!item.sent_at && item.scheduled_at && <p className="text-slate-400 mt-0.5" style={{ fontSize: queueFontSize - 3 }}>Agendado {new Date(item.scheduled_at).toLocaleString('pt-BR')}</p>}
                        {item.erro && (
                          <p title={item.erro} className="text-red-400 mt-0.5 truncate max-w-40 cursor-help" style={{ fontSize: queueFontSize - 3 }}>
                            ⚠ {item.erro}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Vista agrupada por contato ── */}
          {queueView === 'agrupado' && (
            <div className="max-h-[32rem] overflow-y-auto p-4 space-y-2">
              {groupedQueue.map((group, gIdx) => {
                const contact = group[0].contacts as any;
                const getTs = (i: any) => i.sent_at || i.scheduled_at;
                const prevGroup = gIdx > 0 ? groupedQueue[gIdx - 1] : null;
                // Intervalo entre contatos: última msg do grupo anterior → primeira msg deste grupo
                const prevLastTs = prevGroup ? getTs(prevGroup[prevGroup.length - 1]) : null;
                const thisFirstTs = getTs(group[0]);
                const contactInterval = prevLastTs && thisFirstTs
                  ? Math.round((new Date(thisFirstTs).getTime() - new Date(prevLastTs).getTime()) / 1000) : null;
                const intervalMin = campaign?.intervalo_min ?? 90;
                const intervalMax = campaign?.intervalo_max ?? 300;
                const withinRange = contactInterval !== null && contactInterval >= intervalMin && contactInterval <= intervalMax;
                const belowMin    = contactInterval !== null && contactInterval < intervalMin;
                return (
                  <div key={group[0].contact_id || gIdx}>
                    {/* Indicador de intervalo entre contatos */}
                    {contactInterval !== null && (
                      <div className="flex items-center gap-2 py-2 px-2">
                        <div className="h-px flex-1 bg-slate-200" />
                        <div className={clsx(
                          'flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 border',
                          withinRange ? 'bg-[#FFF3EC] text-[#FF5706] border-[#FF8754]' :
                          belowMin    ? 'bg-red-50 text-red-500 border-red-200' :
                                        'bg-amber-50 text-amber-600 border-amber-200',
                        )}>
                          <span className="tabular-nums">{contactInterval}s entre contatos</span>
                          <span className="opacity-60">({intervalMin}–{intervalMax}s esperado)</span>
                        </div>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>
                    )}
                    {/* Card do grupo */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                      <div className="px-4 py-2.5 bg-white border-b border-slate-100 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-slate-500">{gIdx + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate" style={{ fontSize: queueFontSize }}>{contact?.nome || '—'}</p>
                          <p className="text-slate-400 font-mono" style={{ fontSize: queueFontSize - 2 }}>{contact?.telefone_normalizado || ''}</p>
                        </div>
                        <span className="text-xs text-slate-400">{group.length} msg{group.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {group.map((item: any, mIdx: number) => {
                          const cfg = QUEUE_STATUS_ICON[item.status] || { Icon: AlertCircle, cls: 'text-slate-400' };
                          const { Icon, cls } = cfg;
                          const prevMsg = mIdx > 0 ? group[mIdx - 1] : null;
                          const msgDiff = prevMsg && getTs(item) && getTs(prevMsg)
                            ? Math.round((new Date(getTs(item)).getTime() - new Date(getTs(prevMsg)).getTime()) / 1000) : null;
                          return (
                            <div key={item.id} className="px-4 py-2.5 flex items-center gap-3" style={{ fontSize: queueFontSize }}>
                              <Icon size={queueFontSize + 1} className={clsx('flex-shrink-0', cls)} />
                              <span className="badge bg-white border border-slate-200 text-slate-500" style={{ fontSize: queueFontSize - 3 }}>{item.tipo}</span>
                              <div className="flex-1" />
                              {msgDiff !== null && msgDiff > 0 && (
                                <span className="text-slate-300 tabular-nums" style={{ fontSize: queueFontSize - 3 }}>+{msgDiff}s</span>
                              )}
                              <div className="text-right flex-shrink-0">
                                {item.sent_at && <p className="text-[#10B981]" style={{ fontSize: queueFontSize - 3 }}>Enviado {new Date(item.sent_at).toLocaleTimeString('pt-BR')}</p>}
                                {!item.sent_at && item.scheduled_at && <p className="text-slate-400" style={{ fontSize: queueFontSize - 3 }}>Agendado {new Date(item.scheduled_at).toLocaleString('pt-BR')}</p>}
                                {item.erro && (
                                  <p title={item.erro} className="text-red-400 truncate max-w-48 cursor-help" style={{ fontSize: queueFontSize - 3 }}>
                                    ⚠ {item.erro}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty queue */}
      {(queueItems as any[]).length === 0 && campaign.status !== 'rascunho' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
          <Clock size={28} className="mx-auto text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">Nenhum item na fila ainda.</p>
          {campaign.status === 'em_execucao' && (
            <p className="text-slate-300 text-xs mt-1">Os itens aparecerão aqui assim que o disparo for enfileirado.</p>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
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
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-ghost">Cancelar</button>
              <button
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isLoading}
                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-xl transition-all text-sm"
              >
                {deleteMut.isLoading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
