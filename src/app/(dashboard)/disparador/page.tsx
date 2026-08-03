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
  Copy,
  ExternalLink,
  RotateCw,
  MessageSquare,
  Calendar,
  User,
  Phone,
  Mail,
  Check,
  CalendarClock
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface QueueLog {
  id: string;
  campaign_id?: string;
  contact_id?: string;
  mensagem_final: string;
  status: string;
  scheduled_at: string;
  sent_at?: string;
  erro?: string;
  contacts?: { id?: string; nome: string; phone: string; email?: string };
  campaigns?: { id?: string; nome: string };
}

export function sanitizeDisplayMessage(text: string): string {
  if (!text) return "";
  let cleaned = text.trim();

  // Strip "Prompt: ..." directive instructions from display if present
  if (/^Prompt:/i.test(cleaned)) {
    const parts = cleaned.split(/\r?\n\r?\n/);
    if (parts.length > 1) {
      cleaned = parts.slice(1).join("\n\n").trim();
    } else {
      cleaned = cleaned.replace(/^Prompt:[^\n]*\n?/i, "").trim();
    }
  }

  cleaned = cleaned.replace(/^Instrução:[^\n]*\n?/i, "").trim();
  return cleaned || text;
}

export default function DisparadorDashboardPage() {
  const { accountId } = useAuth();
  const router = useRouter();
  const [queue, setQueue] = useState<QueueLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("todos");
  const [limit, setLimit] = useState<number>(500);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<QueueLog | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const [followUpDelayHours, setFollowUpDelayHours] = useState(24);
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);

  const handleOpenFollowUpModal = () => {
    if (!selectedItem) return;
    const name = selectedItem.contacts?.nome ? selectedItem.contacts.nome.split(" ")[0] : "Cliente";
    setFollowUpText(`Olá ${name}, passando para dar um breve retorno sobre a mensagem anterior. Teve oportunidade de visualizar?`);
    setFollowUpDelayHours(24);
    setFollowUpModalOpen(true);
  };

  const handleScheduleFollowUp = async () => {
    if (!selectedItem?.contact_id || !followUpText.trim()) {
      toast.error("Preencha o texto do follow-up.");
      return;
    }
    setFollowUpSubmitting(true);
    try {
      const res = await fetch("/api/disparador/queue/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selectedItem.contact_id,
          campaignId: selectedItem.campaign_id,
          messageText: followUpText,
          delayHours: followUpDelayHours,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao agendar follow-up.");

      toast.success(data.message || "Follow-up agendado com sucesso!");
      setFollowUpModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Falha ao agendar follow-up");
    } finally {
      setFollowUpSubmitting(false);
    }
  };

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

        // Keep selected item updated if modal is open
        if (selectedItem) {
          const updated = (data.queue ?? []).find((item: QueueLog) => item.id === selectedItem.id);
          if (updated) setSelectedItem(updated);
        }
      }
    } catch (err) {
      console.error("Failed to load queue dashboard stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryItem = async (queueId: string) => {
    setRetrying(true);
    try {
      const res = await fetch("/api/disparador/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Falha ao reagendar mensagem");
      }

      toast.success("Mensagem colocada na fila para reenvio!");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao tentar reenviar");
    } finally {
      setRetrying(false);
    }
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Texto da mensagem copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInboxChat = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    router.push(`/inbox?phone=${cleanPhone}`);
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
            <p className="mt-0.5 text-xs text-muted-foreground">
              Clique em qualquer mensagem para ver os detalhes completos
            </p>
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

        {/* Queue List */}
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
            <div className="space-y-2 font-mono text-[11px]">
              {filteredQueue.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between border border-border/40 hover:border-primary/40 bg-card hover:bg-muted/30 p-3 rounded-xl transition-all cursor-pointer shadow-2xs gap-2"
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
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {item.contacts?.nome || "Contato"}
                        </span>
                        <span className="text-muted-foreground text-[10px]">({item.contacts?.phone || "Sem Número"})</span>
                        <span className="px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground text-[9px] uppercase font-bold">
                          {item.campaigns?.nome || "Sem Campanha"}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate mt-0.5 text-[10px] leading-relaxed">
                        {sanitizeDisplayMessage(item.mensagem_final)}
                      </p>
                      {item.status === "erro" && (
                        <p className="text-red-500 text-[9px] flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="h-3 w-3" /> Erro: {item.erro || "Falha desconhecida"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 sm:ml-4 justify-between sm:justify-end">
                    <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline-block">
                      Ver detalhes ➔
                    </span>
                    <div className="text-right">
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Item Details Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-md sm:max-w-lg border-border bg-card">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {selectedItem?.status === "enviado" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
              {selectedItem?.status === "erro" && <AlertCircle className="h-5 w-5 text-red-500" />}
              {selectedItem?.status === "enviando" && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
              {selectedItem?.status === "agendado" && <Clock className="h-5 w-5 text-zinc-400" />}
              <DialogTitle className="text-base">Detalhes da Mensagem na Fila</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              ID da Mensagem: <code className="font-mono">{selectedItem?.id}</code>
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4 py-2 text-xs">
              {/* Status Badge Banner */}
              <div className={`rounded-xl p-3 border flex items-center justify-between ${
                selectedItem.status === "enviado" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" :
                selectedItem.status === "erro" ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400" :
                selectedItem.status === "enviando" ? "bg-primary/10 border-primary/30 text-primary" :
                "bg-muted/40 border-border text-muted-foreground"
              }`}>
                <div className="flex items-center gap-2 font-medium">
                  <span className="uppercase tracking-wider font-bold text-[11px]">
                    Status: {selectedItem.status === "agendado" ? "Agendado para envio" : selectedItem.status}
                  </span>
                </div>
                <span className="text-[11px] font-mono">
                  {selectedItem.sent_at
                    ? `Enviado às ${new Date(selectedItem.sent_at).toLocaleTimeString()}`
                    : `Agendado: ${new Date(selectedItem.scheduled_at).toLocaleTimeString()}`}
                </span>
              </div>

              {/* Error Alert Box (if error) */}
              {selectedItem.status === "erro" && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-600 dark:text-red-300 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" /> Motivo da Falha:
                  </div>
                  <p className="text-xs font-mono bg-background/50 p-2 rounded border border-red-500/20 whitespace-pre-wrap break-all">
                    {selectedItem.erro || "Ocorreu um erro desconhecido durante o disparo."}
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={retrying}
                    onClick={() => handleRetryItem(selectedItem.id)}
                    className="w-full h-8 text-xs gap-1.5 mt-1"
                  >
                    {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                    Tentar Reenviar Mensagem Agora
                  </Button>
                </div>
              )}

              {/* Contact Info Card */}
              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                    <User className="h-3.5 w-3.5 text-primary" /> Destinatário
                  </span>
                  {selectedItem.contacts?.phone && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenInboxChat(selectedItem.contacts!.phone)}
                      className="h-7 text-[11px] gap-1 text-primary hover:text-primary"
                    >
                      <MessageSquare className="h-3 w-3" /> Abrir no Inbox <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[10px]">Nome:</span>
                    <p className="font-medium text-foreground">{selectedItem.contacts?.nome || "Contato"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">Telefone:</span>
                    <p className="font-mono font-medium text-foreground">{selectedItem.contacts?.phone || "Sem Número"}</p>
                  </div>
                </div>

                {selectedItem.campaigns?.nome && (
                  <div className="pt-1 border-t border-border/40">
                    <span className="text-muted-foreground text-[10px]">Campanha:</span>
                    <p className="font-medium text-foreground">{selectedItem.campaigns.nome}</p>
                  </div>
                )}
              </div>

              {/* Full Message Text Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" /> Texto Completo da Mensagem:
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopyMessage(sanitizeDisplayMessage(selectedItem.mensagem_final))}
                    className="h-6 text-[10px] gap-1 px-2"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copiado!" : "Copiar Texto"}
                  </Button>
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-3 font-sans text-xs whitespace-pre-wrap leading-relaxed text-foreground max-h-48 overflow-y-auto">
                  {sanitizeDisplayMessage(selectedItem.mensagem_final)}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between gap-2 sm:gap-0">
            {selectedItem?.contact_id && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenFollowUpModal}
                className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10 mr-auto"
              >
                <CalendarClock className="h-3.5 w-3.5" /> Agendar Follow-up
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setSelectedItem(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up Scheduling Modal */}
      <Dialog open={followUpModalOpen} onOpenChange={setFollowUpModalOpen}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" /> Agendar Follow-up Personalizado
            </DialogTitle>
            <DialogDescription className="text-xs">
              Agende uma nova mensagem de acompanhamento para {selectedItem?.contacts?.nome || "este contato"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Tempo de Espera (Delay):</label>
              <select
                value={followUpDelayHours}
                onChange={(e) => setFollowUpDelayHours(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus:outline-none"
              >
                <option value={2}>Em 2 Horas</option>
                <option value={6}>Em 6 Horas</option>
                <option value={12}>Em 12 Horas</option>
                <option value={24}>Amanhã neste mesmo horário (24 Horas)</option>
                <option value={48}>Em 2 Dias (48 Horas)</option>
                <option value={72}>Em 3 Dias (72 Horas)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Mensagem de Follow-up:</label>
              <textarea
                rows={4}
                value={followUpText}
                onChange={(e) => setFollowUpText(e.target.value)}
                placeholder="Digite a mensagem de acompanhamento..."
                className="w-full rounded-md border border-input bg-background p-3 text-xs focus:outline-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setFollowUpModalOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={followUpSubmitting} onClick={handleScheduleFollowUp} className="gap-1.5">
              {followUpSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
