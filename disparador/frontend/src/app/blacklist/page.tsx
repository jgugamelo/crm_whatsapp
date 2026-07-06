'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { blacklistApi, normalizePhoneInput } from '@/lib/api';
import { Plus, Trash2, ShieldOff, X } from 'lucide-react';

const MOTIVO_OPTIONS = [
  'bloqueio_manual',
  'opt_out',
  'numero_invalido',
  'reclamacao',
  'risco_juridico',
  'resposta_negativa',
];

const MOTIVO_COLORS: Record<string, string> = {
  bloqueio_manual:   'bg-slate-100 text-slate-600',
  opt_out:           'bg-blue-100 text-blue-700',
  numero_invalido:   'bg-orange-100 text-orange-600',
  reclamacao:        'bg-red-100 text-red-700',
  risco_juridico:    'bg-red-100 text-red-800',
  resposta_negativa: 'bg-amber-100 text-amber-700',
};

export default function BlacklistPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ telefone: '+55', motivo: 'bloqueio_manual' });

  const { data, isLoading } = useQuery('blacklist', () => blacklistApi.list().then(r => r.data));
  const addMut = useMutation((d: any) => blacklistApi.add(d), {
    onSuccess: () => { qc.invalidateQueries('blacklist'); setShowForm(false); setForm({ telefone: '+55', motivo: 'bloqueio_manual' }); },
  });
  const removeMut = useMutation((id: string) => blacklistApi.remove(id), {
    onSuccess: () => qc.invalidateQueries('blacklist'),
  });

  const entries: any[] = data?.data || [];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Blacklist Global</h1>
          <p className="text-slate-400 text-sm mt-1">Números bloqueados nunca receberão mensagens</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-medium px-4 py-2 rounded-xl transition-all text-sm shadow-sm">
          <Plus size={15} /> Adicionar número
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Telefone</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Motivo</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Adicionado em</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>
                <td colSpan={4} className="px-5 py-4">
                  <div className="h-4 bg-slate-100 rounded-lg animate-pulse w-3/4" />
                </td>
              </tr>
            ))}
            {!isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-16 text-center">
                  <ShieldOff size={32} className="mx-auto text-slate-200 mb-3" />
                  <p className="text-slate-400 text-sm">Nenhum número bloqueado</p>
                  <p className="text-slate-300 text-xs mt-1">Adicione números que nunca devem receber mensagens</p>
                </td>
              </tr>
            )}
            {entries.map((b: any) => (
              <tr key={b.id} className="hover:bg-slate-50/60 transition-colors group">
                <td className="px-5 py-3.5 font-mono text-sm font-medium text-slate-800">{b.telefone}</td>
                <td className="px-5 py-3.5">
                  <span className={`badge ${MOTIVO_COLORS[b.motivo] || 'bg-slate-100 text-slate-500'}`}>
                    {b.motivo?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-400">
                  {new Date(b.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-5 py-3.5">
                  <button
                    onClick={() => removeMut.mutate(b.id)}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Remover da blacklist"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {entries.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40">
            <p className="text-xs text-slate-400">{entries.length} número{entries.length !== 1 ? 's' : ''} bloqueado{entries.length !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      {/* Modal: Adicionar à blacklist */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Adicionar à Blacklist</h2>
                <p className="text-xs text-slate-400 mt-0.5">O número não receberá mensagens em nenhuma campanha</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Número de telefone</label>
                <input
                  placeholder="+5511999999999"
                  value={form.telefone}
                  onChange={e => setForm(f => ({ ...f, telefone: normalizePhoneInput(e.target.value) }))}
                  className="input font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">Inclua o código do país (ex: +55) — símbolos e espaços são removidos automaticamente</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Motivo</label>
                <select
                  value={form.motivo}
                  onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                  className="input"
                >
                  {MOTIVO_OPTIONS.map(m => (
                    <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end px-6 pb-6">
              <button onClick={() => setShowForm(false)} className="btn-ghost">Cancelar</button>
              <button
                onClick={() => addMut.mutate(form)}
                disabled={!form.telefone || addMut.isLoading}
                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-xl transition-all text-sm"
              >
                {addMut.isLoading ? 'Adicionando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
