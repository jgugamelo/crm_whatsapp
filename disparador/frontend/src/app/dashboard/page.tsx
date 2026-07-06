'use client';
import { useQuery } from 'react-query';
import { dashboardApi } from '@/lib/api';
import {
  Users, Megaphone, Smartphone, MessageSquare,
  TrendingUp, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';

/* ── Mapa de cores DDM para os ícones dos cards ─────────────────────── */
const colorMap: Record<string, { bg: string; color: string }> = {
  orange: { bg: '#FFF3EC', color: '#FF5706' },
  red:    { bg: 'rgba(239,68,68,0.1)', color: '#EF4444' },
  yellow: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B' },
};

/* ── StatCard ─────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value?: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  const palette = colorMap[color] ?? colorMap.orange;
  return (
    <div
      className="bg-white rounded-xl border border-gray-100 p-6 flex items-start gap-4 transition-shadow hover:shadow-md"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
    >
      <div
        className="p-2.5 rounded-lg flex-shrink-0"
        style={{ background: palette.bg }}
      >
        <Icon size={18} style={{ color: palette.color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: '#6B7280', fontFamily: 'Inter, sans-serif' }}>
          {label}
        </p>
        <p
          className="text-2xl font-bold mt-0.5 leading-none"
          style={{ color: '#1A1A2E', fontFamily: 'Poppins, sans-serif' }}
        >
          {value ?? '—'}
        </p>
        {sub && (
          <p className="text-xs mt-1" style={{ color: '#939598', fontFamily: 'Inter, sans-serif' }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── SectionHeader ────────────────────────────────────────────────────── */
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2
        className="font-semibold uppercase whitespace-nowrap"
        style={{ color: '#939598', fontFamily: 'Poppins, sans-serif', fontSize: 13, letterSpacing: '0.12em' }}
      >
        {title}
      </h2>
      <div className="flex-1 h-px" style={{ background: '#EDE8E3' }} />
    </div>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-gray-100 rounded-lg" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 bg-gray-100 rounded w-24" />
          <div className="h-7 bg-gray-100 rounded w-16" />
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { data, isLoading } = useQuery('dashboard-overview', () =>
    dashboardApi.overview().then(r => r.data),
  );

  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <div>
          <div className="h-8 bg-gray-200 rounded-xl w-48 animate-pulse" />
          <div className="h-4 bg-gray-100 rounded-xl w-64 mt-2 animate-pulse" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i}>
            <div className="h-3 bg-gray-100 rounded w-24 mb-4 animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, j) => <SkeletonCard key={j} />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const { contacts, sessions, campaigns, queue, attendance } = data || {};
  const taxaResposta = campaigns?.enviados > 0
    ? ((campaigns.respostas / campaigns.enviados) * 100).toFixed(1) + '%'
    : '0%';

  return (
    <div className="p-8 space-y-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: '#1A1A2E', fontFamily: 'Poppins, sans-serif' }}
          >
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: '#9CA3AF', fontFamily: 'Inter, sans-serif' }}>
            Visão geral da operação em tempo real
          </p>
        </div>

        {/* Badge "Ao vivo" */}
        <div
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{
            background: '#FFF3EC',
            color: '#FF5706',
            border: '1px solid #FF8754',
            fontFamily: 'Poppins, sans-serif',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: '#FF5706' }}
          />
          Ao vivo
        </div>
      </div>

      {/* ── Contatos ── */}
      <section>
        <SectionHeader title="Contatos" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total de Contatos"  value={contacts?.total?.toLocaleString('pt-BR')}       icon={Users}         color="orange" />
          <StatCard label="Aptos para Envio"   value={contacts?.aptos?.toLocaleString('pt-BR')}       icon={CheckCircle2}  color="orange" />
          <StatCard label="Bloqueados"         value={contacts?.bloqueados?.toLocaleString('pt-BR')}  icon={Users}         color="red"    />
          <StatCard label="Blacklist"          value={contacts?.blacklisted?.toLocaleString('pt-BR')} icon={AlertTriangle} color="red"    />
        </div>
      </section>

      {/* ── Campanhas ── */}
      <section>
        <SectionHeader title="Campanhas" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Campanhas Ativas"   value={campaigns?.ativas}                               icon={Megaphone}     color="orange" />
          <StatCard label="Mensagens Enviadas" value={campaigns?.enviados?.toLocaleString('pt-BR')}    icon={TrendingUp}    color="orange" />
          <StatCard label="Respostas"          value={campaigns?.respostas?.toLocaleString('pt-BR')}   icon={MessageSquare} color="orange" sub={taxaResposta + ' de taxa'} />
          <StatCard label="Convertidos"        value={campaigns?.convertidos?.toLocaleString('pt-BR')} icon={TrendingUp}    color="orange" />
        </div>
      </section>

      {/* ── Operação ── */}
      <section>
        <SectionHeader title="Operação" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Sessões Conectadas"   value={sessions?.conectadas}                          icon={Smartphone}    color="orange" sub={`${sessions?.total ?? 0} total`} />
          <StatCard label="Sessões Instáveis"    value={sessions?.instaveis}                           icon={AlertTriangle} color="yellow" />
          <StatCard label="Envios Hoje"          value={sessions?.enviosHoje?.toLocaleString('pt-BR')} icon={TrendingUp}    color="orange" />
          <StatCard label="Atendimentos Abertos" value={attendance?.novos}                             icon={Clock}         color="orange" sub={`${attendance?.emAtendimento ?? 0} em andamento`} />
        </div>
      </section>

      {/* ── Fila ── */}
      {queue && Object.keys(queue).length > 0 && (
        <section>
          <SectionHeader title="Fila de Hoje" />
          <div
            className="bg-white rounded-xl border border-gray-100 p-6"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <div className="flex flex-wrap gap-8">
              {Object.entries(queue).map(([status, count]: any) => (
                <div key={status} className="text-center">
                  <p
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: '#1A1A2E', fontFamily: 'Poppins, sans-serif' }}
                  >
                    {count}
                  </p>
                  <p
                    className="text-xs font-medium capitalize mt-1"
                    style={{ color: '#9CA3AF', fontFamily: 'Inter, sans-serif' }}
                  >
                    {status}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
