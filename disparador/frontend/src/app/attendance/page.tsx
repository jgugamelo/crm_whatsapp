'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { attendanceApi } from '@/lib/api';
import { UserCheck, ThumbsUp, ThumbsDown, MessageSquare, Inbox } from 'lucide-react';
import clsx from 'clsx';

const STATUS_COLORS: Record<string, string> = {
  novo:                'bg-blue-100 text-blue-700',
  aguardando_vendedor: 'bg-amber-100 text-amber-700',
  em_atendimento:      'bg-[#FFF3EC] text-[#FF5706]',
  aguardando_cliente:  'bg-orange-100 text-orange-600',
  concluido:           'bg-slate-100 text-slate-500',
  perdido:             'bg-red-100 text-red-600',
  convertido:          'bg-[#F0FDF4] text-[#10B981]',
};

const FILTER_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'novo', label: 'Novos' },
  { value: 'em_atendimento', label: 'Em atendimento' },
  { value: 'aguardando_vendedor', label: 'Aguardando' },
  { value: 'concluido', label: 'Concluídos' },
  { value: 'convertido', label: 'Convertidos' },
];

export default function AttendancePage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery(['attendance', statusFilter], () =>
    attendanceApi.list({ status: statusFilter || undefined }).then(r => r.data));

  const assignMut = useMutation((id: string) => attendanceApi.assign(id), {
    onSuccess: () => qc.invalidateQueries('attendance'),
  });
  const concludeMut = useMutation(({ id, status }: any) => attendanceApi.updateStatus(id, { status }), {
    onSuccess: () => qc.invalidateQueries('attendance'),
  });

  const cards: any[] = data?.data || [];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Atendimento</h1>
        <p className="text-slate-400 text-sm mt-1">Contatos que demonstraram interesse durante campanhas</p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={clsx(
              'px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all',
              statusFilter === value
                ? 'bg-[#FF5706] text-white shadow-sm'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse h-28" />
        ))}

        {!isLoading && cards.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
            <Inbox size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm">Nenhum atendimento encontrado</p>
          </div>
        )}

        {cards.map((card: any) => (
          <div key={card.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-slate-900">{card.contacts?.nome || 'Sem nome'}</p>
                  <span className={clsx('badge', STATUS_COLORS[card.status] || 'bg-slate-100 text-slate-500')}>
                    {card.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs font-mono text-slate-400">{card.contacts?.telefone_normalizado}</p>
                <p className="text-xs text-slate-400 mt-1">
                  Campanha: <span className="text-slate-600">{card.campaigns?.nome || '—'}</span>
                </p>

                {card.resumo_ia && (
                  <div className="flex items-start gap-2 mt-3 bg-slate-50 rounded-xl px-3 py-2.5">
                    <MessageSquare size={13} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 leading-relaxed">{card.resumo_ia}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {card.status === 'novo' && (
                  <button
                    onClick={() => assignMut.mutate(card.id)}
                    disabled={assignMut.isLoading}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    <UserCheck size={13} /> Assumir
                  </button>
                )}
                {card.status === 'em_atendimento' && (
                  <>
                    <button
                      onClick={() => concludeMut.mutate({ id: card.id, status: 'convertido' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#10B981] hover:bg-[#059669] text-white rounded-xl transition-all"
                    >
                      <ThumbsUp size={13} /> Convertido
                    </button>
                    <button
                      onClick={() => concludeMut.mutate({ id: card.id, status: 'perdido' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-100 hover:bg-red-200 text-red-600 rounded-xl transition-all"
                    >
                      <ThumbsDown size={13} /> Perdido
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
