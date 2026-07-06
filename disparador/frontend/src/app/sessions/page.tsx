'use client';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { sessionsApi } from '@/lib/api';
import { Plus, Play, Square, RefreshCw, QrCode, Trash2, Smartphone, X, AlertCircle, Settings, Globe } from 'lucide-react';
import clsx from 'clsx';

const STATUS_COLORS: Record<string, string> = {
  conectada:         'bg-[#FFF3EC] text-[#FF5706]',
  desconectada:      'bg-slate-100 text-slate-500',
  aguardando_qrcode: 'bg-amber-100 text-amber-700',
  instavel:          'bg-orange-100 text-orange-600',
  bloqueada:         'bg-red-100 text-red-700',
  pausada:           'bg-orange-100 text-orange-700',
  erro:              'bg-red-100 text-red-600',
};

const STATUS_DOT: Record<string, string> = {
  conectada:         'bg-[#FF5706]',
  desconectada:      'bg-slate-400',
  aguardando_qrcode: 'bg-amber-500 animate-pulse',
  instavel:          'bg-orange-500',
  erro:              'bg-red-500',
};

const EMPTY_FORM = { nome_sessao: '', limite_diario: 500, proxy_server: '', proxy_username: '', proxy_password: '' };
const EMPTY_PROXY = { proxy_server: '', proxy_username: '', proxy_password: '' };

const isDdmSessionName = (sessionName: string) => {
  const normalized = String(sessionName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return normalized.includes('ddm');
};

export default function SessionsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showProxy, setShowProxy] = useState(false);

  const [qrSession, setQrSession] = useState<{ id: string; nome: string; qr: any } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [proxyModal, setProxyModal] = useState<{ id: string; nome: string } | null>(null);
  const [proxyForm, setProxyForm] = useState(EMPTY_PROXY);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Sync todas as sessões ao entrar na página
  useEffect(() => {
    sessionsApi.syncAll().catch(() => null);
  }, []);

  const { data: sessions = [], isLoading } = useQuery('sessions', () =>
    sessionsApi.list().then(r => r.data ?? []), { refetchInterval: 10000 });

  const { data: wahaAvailable = [] } = useQuery('waha-available', () =>
    sessionsApi.listWahaAvailable().then(r => r.data ?? []), { refetchInterval: 20000 });

  const createMut  = useMutation((d: any) => sessionsApi.create(d), {
    onSuccess: () => { qc.invalidateQueries('sessions'); setShowForm(false); setForm(EMPTY_FORM); setShowProxy(false); },
  });
  const startMut   = useMutation((id: string) => sessionsApi.start(id),  { onSuccess: () => qc.invalidateQueries('sessions') });
  const stopMut    = useMutation((id: string) => sessionsApi.stop(id),   { onSuccess: () => qc.invalidateQueries('sessions') });
  const syncMut    = useMutation((id: string) => sessionsApi.sync(id),   { onSuccess: () => qc.invalidateQueries('sessions') });
  const deleteMut  = useMutation((id: string) => sessionsApi.remove(id), {
    onSuccess: () => { qc.invalidateQueries('sessions'); setDeleteConfirm(null); },
  });
  const proxyMut   = useMutation(({ id, data }: any) => sessionsApi.updateProxy(id, data), {
    onSuccess: () => { qc.invalidateQueries('sessions'); setProxyModal(null); setProxyForm(EMPTY_PROXY); },
  });

  // Polling de status enquanto modal QR está aberto
  const startPolling = (id: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await sessionsApi.getStatus(id);
        if (data.status === 'conectada') {
          qc.invalidateQueries('sessions');
          stopPolling();
          setQrSession(null);
        }
      } catch { /* ignora */ }
    }, 4000);
  };

  const stopPolling = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  };

  useEffect(() => () => stopPolling(), []);

  const showQr = async (id: string, nome: string) => {
    setQrLoading(true);
    setQrError('');
    setQrSession({ id, nome, qr: null });
    try {
      const { data: qr } = await sessionsApi.qrCode(id);
      setQrSession({ id, nome, qr });
      startPolling(id);
    } catch (e: any) {
      setQrError(e?.response?.data?.message || 'Não foi possível obter o QR code. Verifique se a sessão existe no WAHA.');
    } finally {
      setQrLoading(false);
    }
  };

  const closeQr = () => { setQrSession(null); setQrError(''); stopPolling(); qc.invalidateQueries('sessions'); };

  const openProxy = (s: any) => {
    setProxyModal({ id: s.id, nome: s.nome_sessao });
    setProxyForm({ proxy_server: s.proxy_server || '', proxy_username: s.proxy_username || '', proxy_password: s.proxy_password || '' });
  };

  const registeredNames = sessions.map((s: any) => s.waha_session_name);
  const unregistered = (wahaAvailable as string[]).filter(n => isDdmSessionName(n) && !registeredNames.includes(n));

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sessões WAHA</h1>
          <p className="text-slate-400 text-sm mt-1">Conecte e gerencie números de WhatsApp</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> Nova Sessão
        </button>
      </div>


      {/* Lista */}
      <div className="space-y-3">
        {isLoading && Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse h-24" />
        ))}
        {!isLoading && sessions.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <Smartphone size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm">Nenhuma sessão cadastrada ainda</p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-4 mx-auto"><Plus size={14} /> Criar primeira sessão</button>
          </div>
        )}
        {sessions.map((s: any) => (
          <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-between group">
            <div className="flex items-center gap-4 min-w-0">
              <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[s.status] ?? 'bg-slate-300')} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{s.nome_sessao}</p>
                  {s.proxy_server && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                      <Globe size={10} /> Proxy
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{s.telefone || 'Aguardando conexão'}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className={clsx('badge', STATUS_COLORS[s.status] ?? 'bg-slate-100 text-slate-500')}>
                    {s.status?.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-slate-400 tabular-nums">{s.envios_hoje ?? 0}/{s.limite_diario} hoje</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {s.status === 'aguardando_qrcode' && (
                <button onClick={() => showQr(s.id, s.nome_sessao)}
                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors" title="Ver QR Code">
                  <QrCode size={17} />
                </button>
              )}
              <button onClick={() => startMut.mutate(s.id)}
                className="p-2 text-[#FF5706] hover:bg-[#FFF3EC] rounded-xl transition-colors" title="Iniciar">
                <Play size={17} />
              </button>
              <button onClick={() => syncMut.mutate(s.id)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors" title="Sincronizar status">
                <RefreshCw size={17} />
              </button>
              <button onClick={() => stopMut.mutate(s.id)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors" title="Parar">
                <Square size={17} />
              </button>
              <button onClick={() => openProxy(s)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors" title="Configurar proxy">
                <Settings size={17} />
              </button>
              <div className="w-px h-5 bg-slate-100 mx-1" />
              <button onClick={() => setDeleteConfirm(s.id)}
                className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors" title="Excluir">
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Nova sessão */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Nova Sessão WAHA</h2>
              <button onClick={() => { setShowForm(false); setShowProxy(false); }} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              {unregistered.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Sessões já no WAHA (clique para preencher)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {unregistered.map(name => (
                      <button key={name} type="button"
                        onClick={() => setForm(f => ({ ...f, nome_sessao: name }))}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors border ${form.nome_sessao === name ? 'bg-[#FFF3EC] border-[#FF8754] text-[#FF5706]' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'}`}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Nome da sessão</label>
                <input placeholder="Ex: numero01" value={form.nome_sessao}
                  onChange={e => setForm(f => ({ ...f, nome_sessao: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Limite diário de envios</label>
                <input type="number" value={form.limite_diario}
                  onChange={e => setForm(f => ({ ...f, limite_diario: +e.target.value }))} className="input" />
              </div>

              {/* Toggle Proxy */}
              <button onClick={() => setShowProxy(p => !p)}
                className="flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
                <Globe size={13} />
                {showProxy ? 'Remover proxy' : 'Configurar proxy (opcional)'}
              </button>

              {showProxy && (
                <div className="space-y-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Servidor</label>
                    <input placeholder="Ex: p.webshare.io:80" value={form.proxy_server}
                      onChange={e => setForm(f => ({ ...f, proxy_server: e.target.value }))} className="input" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Usuário</label>
                      <input placeholder="username" value={form.proxy_username}
                        onChange={e => setForm(f => ({ ...f, proxy_username: e.target.value }))} className="input" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">Senha</label>
                      <input type="password" placeholder="••••••" value={form.proxy_password}
                        onChange={e => setForm(f => ({ ...f, proxy_password: e.target.value }))} className="input" />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end px-6 pb-6">
              <button onClick={() => { setShowForm(false); setShowProxy(false); }} className="btn-ghost">Cancelar</button>
              <button onClick={() => createMut.mutate(form)} disabled={!form.nome_sessao || createMut.isLoading} className="btn-primary">
                {createMut.isLoading ? 'Criando...' : 'Criar Sessão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: QR Code */}
      {qrSession && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Escanear QR Code</h2>
              <button onClick={closeQr} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="p-6 text-center space-y-4">
              <p className="text-xs text-slate-400">Sessão: <span className="font-medium text-slate-700">{qrSession.nome}</span></p>
              {qrLoading && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-8 h-8 border-2 border-[#FF5706] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-slate-400">Iniciando sessão e aguardando QR...</p>
                  <p className="text-xs text-slate-300">Pode levar até 15 segundos</p>
                </div>
              )}
              {qrError && (
                <div className="flex items-start gap-2 text-left bg-red-50 border border-red-100 rounded-xl p-4">
                  <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600">{qrError}</p>
                </div>
              )}
              {!qrLoading && !qrError && qrSession.qr?.value && (
                <>
                  <img src={qrSession.qr.value} alt="QR Code" className="mx-auto rounded-xl w-56 h-56" />
                  <div className="flex items-center gap-2 justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#FF5706] animate-pulse" />
                    <p className="text-xs text-slate-400">Aguardando leitura...</p>
                  </div>
                  <p className="text-xs text-slate-300">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
                </>
              )}
              {!qrLoading && !qrError && !qrSession.qr?.value && (
                <p className="text-sm text-slate-400 py-8">QR Code não disponível para esta sessão.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Proxy */}
      {proxyModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Configurar Proxy</h2>
                <p className="text-xs text-slate-400 mt-0.5">{proxyModal.nome}</p>
              </div>
              <button onClick={() => setProxyModal(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Servidor</label>
                <input placeholder="Ex: p.webshare.io:80" value={proxyForm.proxy_server}
                  onChange={e => setProxyForm(f => ({ ...f, proxy_server: e.target.value }))} className="input" />
                <p className="text-[11px] text-slate-400 mt-1">Formato: host:porta</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Usuário</label>
                  <input placeholder="username" value={proxyForm.proxy_username}
                    onChange={e => setProxyForm(f => ({ ...f, proxy_username: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Senha</label>
                  <input type="password" placeholder="••••••" value={proxyForm.proxy_password}
                    onChange={e => setProxyForm(f => ({ ...f, proxy_password: e.target.value }))} className="input" />
                </div>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                Atualizar o proxy vai reiniciar a sessão no WAHA — será necessário escanear o QR novamente.
              </p>
            </div>
            <div className="flex gap-2 justify-end px-6 pb-6">
              <button onClick={() => setProxyModal(null)} className="btn-ghost">Cancelar</button>
              <button
                onClick={() => proxyMut.mutate({ id: proxyModal.id, data: proxyForm })}
                disabled={!proxyForm.proxy_server || proxyMut.isLoading}
                className="btn-primary">
                {proxyMut.isLoading ? 'Salvando...' : 'Salvar Proxy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar exclusão */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Excluir sessão?</p>
                <p className="text-xs text-slate-400 mt-0.5">A sessão será removida do sistema e do WAHA.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost">Cancelar</button>
              <button onClick={() => deleteMut.mutate(deleteConfirm)} disabled={deleteMut.isLoading}
                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-medium px-4 py-2 rounded-xl transition-all text-sm">
                {deleteMut.isLoading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
