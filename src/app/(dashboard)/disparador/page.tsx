"use client";

import { useEffect, useState, useMemo } from "react";
import { 
  Megaphone, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowRight,
  TrendingUp,
  Inbox,
  AlertTriangle,
  Search,
  Filter,
  ListFilter
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";

interface QueueLog {
  id: string;
  campaign_id: string;
  mensagem_final: string;
  status: string;
  scheduled_at: string;
  sent_at?: string;
  erro?: string;
  contacts?: { nome: string; phone: string };
  campaigns?: { nome: string };
}

export default function DisparadorDashboardPage() {
  const { accountId } = useAuth();
  const [queue, setQueue] = useState<QueueLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("todos");
  const [limit, setLimit] = useState<number>(500);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [stats, setStats] = useState({
    scheduled: 0,
    sending: 0,
    success: 0,
    failed: 0,
  });

  useEffect(() => {
    if (accountId) {
      loadData();
      const interval = setInterval(loadData, 5000); // refresh queue status every 5s
      return () => clearInterval(interval);
    }
  }, [accountId, selectedStatus, limit]);

  const loadData = async () => {
    if (!accountId) return;
    try {
      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        ...(selectedStatus !== "todos" && { status: selectedStatus }),
      });
      const res = await fetch(`/api/disparador/queue?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setQueue(data.queue ?? []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to load queue dashboard stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredQueue = useMemo(() => {
    if (!searchQuery.trim()) return queue;
    const q = searchQuery.toLowerCase().trim();
    return queue.filter((item) => {
      const name = item.contacts?.nome?.toLowerCase() || "";
      const phone = item.contacts?.phone?.toLowerCase() || "";
      const msg = item.mensagem_final?.toLowerCase() || "";
      const campaign = item.campaigns?.nome?.toLowerCase() || "";
      return name.includes(q) || phone.includes(q) || msg.includes(q) || campaign.includes(q);
    });
  }, [queue, searchQuery]);

  const totalInSystem = stats.scheduled + stats.sending + stats.success + stats.failed;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col space-y-4 p-4 lg:p-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border/40 pb-4 sm:flex-row sm:items-center shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Megaphone className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Central do Disparador
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe o processamento de campanhas e envios em massa na nuvem.
          </p>
        </div>

        <div className="flex gap-2.5">
          <Link href="/disparador/blacklist">
            <Button variant="outline" className="gap-1.5 text-xs h-9">
              <ShieldAlert className="h-4 w-4 text-red-500" /> Blacklist
            </Button>
          </Link>
          <Link href="/disparador/campanhas">
            <Button className="gap-1.5 text-xs h-9">
              Gerenciar Campanhas <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
        <button
          onClick={() => setSelectedStatus(selectedStatus === "agendado" ? "todos" : "agendado")}
          className={`text-left rounded-xl border p-4 space-y-1.5 shadow-sm transition-all ${
            selectedStatus === "agendado"
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Agendados na Fila</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground">{stats.scheduled}</span>
            <Clock className="h-5 w-5 text-zinc-400" />
          </div>
        </button>

        <button
          onClick={() => setSelectedStatus(selectedStatus === "enviando" ? "todos" : "enviando")}
          className={`text-left rounded-xl border p-4 space-y-1.5 shadow-sm transition-all ${
            selectedStatus === "enviando"
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Processando</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-primary flex items-center gap-1.5">
              {stats.sending > 0 && <Loader2 className="h-4 w-4 animate-spin" />}
              {stats.sending}
            </span>
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
        </button>

        <button
          onClick={() => setSelectedStatus(selectedStatus === "enviado" ? "todos" : "enviado")}
          className={`text-left rounded-xl border p-4 space-y-1.5 shadow-sm transition-all ${
            selectedStatus === "enviado"
              ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <span className="text-[10px] font-bold text-emerald-500 uppercase">Sucesso total</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-500">{stats.success}</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
        </button>

        <button
          onClick={() => setSelectedStatus(selectedStatus === "erro" ? "todos" : "erro")}
          className={`text-left rounded-xl border p-4 space-y-1.5 shadow-sm transition-all ${
            selectedStatus === "erro"
              ? "border-red-500 bg-red-500/5 ring-1 ring-red-500"
              : "border-border bg-card hover:bg-muted/40"
          }`}
        >
          <span className="text-[10px] font-bold text-red-500 uppercase">Falhas</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-red-500">{stats.failed}</span>
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
        </button>
      </div>

      {/* Main Content (Log monitor) */}
      <div className="flex-1 flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Monitor Header with Filter Controls */}
        <header className="border-b border-border p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-muted/20 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Monitor da Fila em Tempo Real</h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Exibindo {filteredQueue.length} {selectedStatus !== "todos" ? `(${selectedStatus})` : ""}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Atualização automática a cada 5 segundos</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-60 min-w-[160px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar contato ou mensagem..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>

            {/* Limit Selector */}
            <Select
              value={limit.toString()}
              onValueChange={(val) => val && setLimit(parseInt(val, 10))}
            >
              <SelectTrigger className="h-8 w-32 text-xs bg-background">
                <SelectValue placeholder="Limite" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">Exibir 50</SelectItem>
                <SelectItem value="100">Exibir 100</SelectItem>
                <SelectItem value="250">Exibir 250</SelectItem>
                <SelectItem value="500">Exibir 500</SelectItem>
                <SelectItem value="1000">Exibir 1000</SelectItem>
              </SelectContent>
            </Select>

            {/* Status Filter Dropdown */}
            <Select
              value={selectedStatus}
              onValueChange={(val) => val && setSelectedStatus(val)}
            >
              <SelectTrigger className="h-8 w-36 text-xs bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos ({totalInSystem})</SelectItem>
                <SelectItem value="agendado">Agendados ({stats.scheduled})</SelectItem>
                <SelectItem value="enviando">Processando ({stats.sending})</SelectItem>
                <SelectItem value="enviado">Sucesso ({stats.success})</SelectItem>
                <SelectItem value="erro">Falhas ({stats.failed})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" />
              Carregando fila de transmissão...
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center text-muted-foreground border border-dashed border-border rounded-xl">
              <Inbox className="h-10 w-10 opacity-20 mb-2" />
              <h4 className="font-semibold text-sm">Nenhuma mensagem encontrada</h4>
              <p className="text-xs max-w-xs mt-1">
                {searchQuery
                  ? "Nenhum resultado corresponde à busca informada."
                  : selectedStatus !== "todos"
                  ? `Nenhuma mensagem com status "${selectedStatus}".`
                  : "Crie e ative uma campanha para começar a ver o tráfego de mensagens aqui."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 font-mono text-[11px]">
              {filteredQueue.map((item) => (
                <div 
                  key={item.id} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/40 pb-2.5 last:border-0 last:pb-0 gap-2 hover:bg-muted/20 p-2 rounded-lg transition-colors"
                >
                  <div className="flex items-start gap-2.5 truncate flex-1 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {item.status === "agendado" && <span className="h-2.5 w-2.5 rounded-full bg-zinc-400 block" />}
                      {item.status === "enviando" && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />}
                      {item.status === "enviado" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      {item.status === "erro" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                    </div>
                    <div className="truncate flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">
                          {item.contacts?.nome || "Contato"}
                        </span>
                        <span className="text-muted-foreground text-[10px]">({item.contacts?.phone || "Sem Número"})</span>
                        <span className="px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground text-[9px] uppercase font-bold">
                          {item.campaigns?.nome || "Sem Campanha"}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate mt-0.5 text-[10px] leading-relaxed">
                        {item.mensagem_final}
                      </p>
                      {item.status === "erro" && (
                        <p className="text-red-500 text-[9px] flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="h-3 w-3" /> Erro: {item.erro || "Falha desconhecida"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 sm:ml-4">
                    <span className={`text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full ${
                      item.status === "enviado" ? "text-emerald-500 bg-emerald-500/10" :
                      item.status === "erro" ? "text-red-500 bg-red-500/10" :
                      item.status === "enviando" ? "text-primary bg-primary/10" : "text-zinc-500 bg-zinc-100 dark:bg-zinc-800"
                    }`}>
                      {item.status === "agendado" ? "Agendado" : item.status}
                    </span>
                    <span className="block text-[9px] text-muted-foreground mt-1 font-sans">
                      {item.status === "enviado" && item.sent_at
                        ? new Date(item.sent_at).toLocaleTimeString()
                        : new Date(item.scheduled_at).toLocaleTimeString()
                      }
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
