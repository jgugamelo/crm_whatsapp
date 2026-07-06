"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { 
  Megaphone, 
  Play, 
  Pause, 
  RotateCcw, 
  Tag, 
  Users, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Trash2,
  HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface TagItem {
  id: string;
  name: string;
  color?: string;
}

interface SendLog {
  contactId: string;
  name: string;
  phone: string;
  status: "pending" | "sending" | "success" | "failed";
  error?: string;
}

export default function DisparadorPage() {
  // Config States
  const [tags, setTags] = useState<TagItem[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>("all"); // "all" or tagId
  const [message, setMessage] = useState<string>("");
  const [delay, setDelay] = useState<number>(5); // delay in seconds

  // List of resolved targets
  const [targets, setTargets] = useState<Contact[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  // Queue and Execution States
  const [queue, setQueue] = useState<SendLog[]>([]);
  const [executionState, setExecutionState] = useState<"idle" | "running" | "paused" | "finished">("idle");
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // References for pause/resume control in loop
  const executionStateRef = useRef(executionState);
  const currentIndexRef = useRef(currentIndex);
  const queueRef = useRef(queue);

  useEffect(() => {
    executionStateRef.current = executionState;
  }, [executionState]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Load Tags on Mount
  useEffect(() => {
    const fetchTags = async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("tags").select("id, name, color").order("name");
      if (!error && data) {
        setTags(data);
      }
    };
    fetchTags();
  }, []);

  // Fetch target contacts whenever tag choice changes
  const fetchTargets = useCallback(async () => {
    setLoadingTargets(true);
    try {
      const supabase = createClient();
      if (selectedTag === "all") {
        const { data, error } = await supabase
          .from("contacts")
          .select("id, name, phone")
          .order("name");
        if (error) throw error;
        setTargets(data ?? []);
      } else {
        const { data: tagLinks, error: linkError } = await supabase
          .from("contact_tags")
          .select("contact_id")
          .eq("tag_id", selectedTag);
        if (linkError) throw linkError;

        if (!tagLinks || tagLinks.length === 0) {
          setTargets([]);
          setLoadingTargets(false);
          return;
        }

        const ids = tagLinks.map((l) => l.contact_id);
        const { data, error } = await supabase
          .from("contacts")
          .select("id, name, phone")
          .in("id", ids)
          .order("name");
        if (error) throw error;
        setTargets(data ?? []);
      }
    } catch (err: any) {
      console.error("Failed to load contacts for campaign:", err);
      toast.error("Erro ao carregar contatos.");
    } finally {
      setLoadingTargets(false);
    }
  }, [selectedTag]);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  // Prepare execution queue
  const handlePrepareQueue = () => {
    if (!message.trim()) {
      toast.error("Por favor, digite o conteúdo da mensagem.");
      return;
    }
    if (targets.length === 0) {
      toast.error("Nenhum contato encontrado no público selecionado.");
      return;
    }

    const newQueue: SendLog[] = targets.map((t) => ({
      contactId: t.id,
      name: t.name,
      phone: t.phone,
      status: "pending",
    }));

    setQueue(newQueue);
    setCurrentIndex(0);
    setExecutionState("idle");
    toast.success(`Fila preparada com ${newQueue.length} destinatários!`);
  };

  // Execution Loop
  const startSending = async () => {
    if (executionState === "running") return;
    setExecutionState("running");

    // We start from the current index (supports resume)
    let idx = currentIndexRef.current;
    const currentQueue = [...queueRef.current];

    while (idx < currentQueue.length && executionStateRef.current === "running") {
      // 1. Mark item as sending
      currentQueue[idx] = {
        ...currentQueue[idx],
        status: "sending",
      };
      setQueue([...currentQueue]);

      const target = currentQueue[idx];
      const parsedText = message.replace(/{nome}/g, target.name || "Cliente");

      try {
        // Send message using CRM backend endpoint
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contact_id: target.contactId,
            message_type: "text",
            content_text: parsedText,
          }),
        });

        if (res.ok) {
          currentQueue[idx] = {
            ...target,
            status: "success",
          };
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Erro HTTP ${res.status}`);
        }
      } catch (err: any) {
        currentQueue[idx] = {
          ...target,
          status: "failed",
          error: err.message || "Erro de conexão",
        };
      }

      // Update state
      setQueue([...currentQueue]);
      idx += 1;
      setCurrentIndex(idx);

      // Wait if there are more contacts
      if (idx < currentQueue.length && executionStateRef.current === "running") {
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
      }
    }

    if (idx >= currentQueue.length) {
      setExecutionState("finished");
      toast.success("Disparo em massa concluído com sucesso!");
    } else {
      setExecutionState("paused");
      toast.info("Envio pausado.");
    }
  };

  const pauseSending = () => {
    setExecutionState("paused");
  };

  const handleReset = () => {
    setExecutionState("idle");
    setCurrentIndex(0);
    setQueue([]);
  };

  // Helper counters
  const total = queue.length;
  const sent = queue.filter((q) => q.status === "success").length;
  const failed = queue.filter((q) => q.status === "failed").length;
  const progressPercent = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col space-y-4 p-4 lg:p-6 overflow-hidden">
      {/* Native Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border/40 pb-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Megaphone className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Disparador de Mensagens Nativo
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie campanhas de envio de mensagens personalizadas diretamente do CRM.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 flex-1 overflow-hidden">
        {/* Settings Panel */}
        <div className="lg:col-span-2 flex flex-col space-y-4 overflow-y-auto pr-2">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" /> Configurar Público
            </h3>

            {/* Target Selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Filtrar por Tag</label>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                disabled={executionState === "running" || executionState === "paused"}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Todos os Contatos ({targets.length})</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    Tag: {t.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {loadingTargets ? "Calculando contatos..." : `${targets.length} contatos selecionados para envio.`}
              </p>
            </div>

            {/* Delay Config */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                Delay entre Mensagens (Segundos)
                <span className="group relative cursor-pointer text-muted-foreground hover:text-foreground">
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden w-48 rounded bg-popover p-2 text-[10px] text-popover-foreground shadow group-hover:block z-50">
                    Espaçamento de tempo para diminuir riscos de banimento pelo WhatsApp. Recomendado: 5s+.
                  </span>
                </span>
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
                disabled={executionState === "running"}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm flex-1 flex flex-col min-h-[300px]">
            <h3 className="text-sm font-semibold text-foreground">Mensagem da Campanha</h3>
            
            <div className="space-y-2 flex-1 flex flex-col">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Olá, {nome}! Tudo bem?..."
                disabled={executionState === "running" || executionState === "paused"}
                className="w-full flex-1 min-h-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none resize-none"
              />
              <div className="flex justify-between items-center text-xs text-muted-foreground pt-1">
                <span>Variável de nome: <code className="bg-muted px-1.5 py-0.5 rounded text-primary">{`{nome}`}</code></span>
                <span>{message.length} caracteres</span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex gap-2">
              {executionState === "idle" && (
                <Button 
                  onClick={handlePrepareQueue}
                  className="w-full"
                >
                  Preparar Envio
                </Button>
              )}
              {executionState !== "idle" && (
                <Button 
                  variant="destructive"
                  onClick={handleReset}
                  className="w-full gap-2"
                >
                  <Trash2 className="h-4 w-4" /> Cancelar Fila
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Sending Queue Panel */}
        <div className="lg:col-span-3 flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden h-full">
          <header className="border-b border-border px-5 py-4 flex items-center justify-between bg-muted/20">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Fila de Disparo</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Progresso e logs em tempo real</p>
            </div>

            {/* Run Controls */}
            {total > 0 && (
              <div className="flex gap-2">
                {executionState === "running" ? (
                  <Button size="sm" variant="outline" onClick={pauseSending} className="gap-1">
                    <Pause className="h-3.5 w-3.5" /> Pausar
                  </Button>
                ) : (
                  <Button size="sm" onClick={startSending} disabled={currentIndex >= total} className="gap-1">
                    <Play className="h-3.5 w-3.5" /> {executionState === "paused" ? "Retomar" : "Iniciar"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={handleReset} disabled={executionState === "running"}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </header>

          <div className="flex-1 flex flex-col overflow-hidden p-5 space-y-4">
            {total === 0 ? (
              <div className="flex-grow flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <Megaphone className="h-10 w-10 mb-2 opacity-30" />
                <h4 className="text-sm font-medium">Nenhum envio em andamento</h4>
                <p className="text-xs max-w-[280px] mt-1">Configure o público e a mensagem do lado esquerdo e clique em &quot;Preparar Envio&quot; para carregar a fila.</p>
              </div>
            ) : (
              <>
                {/* Metrics row */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-muted/40 p-2.5 rounded-lg border border-border/50">
                    <span className="block text-xl font-bold text-foreground tabular-nums">{total}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">Total</span>
                  </div>
                  <div className="bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                    <span className="block text-xl font-bold text-emerald-500 tabular-nums">{sent}</span>
                    <span className="text-[10px] text-emerald-600 uppercase">Enviados</span>
                  </div>
                  <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                    <span className="block text-xl font-bold text-red-500 tabular-nums">{failed}</span>
                    <span className="text-[10px] text-red-600 uppercase">Falhas</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{progressPercent}% concluído</span>
                    <span>{currentIndex} de {total}</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Logs List */}
                <div className="flex-1 border border-border rounded-lg bg-muted/10 overflow-hidden flex flex-col">
                  <div className="px-3 py-2 border-b border-border bg-muted/40 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Logs de Transmissão
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[11px] max-h-[300px]">
                    {queue.map((item, i) => (
                      <div key={item.contactId} className="flex justify-between items-center border-b border-border/30 pb-1.5 last:border-0 last:pb-0">
                        <div className="flex items-center gap-1.5 truncate">
                          {item.status === "pending" && <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />}
                          {item.status === "sending" && <Loader2 className="h-3 w-3 text-primary animate-spin" />}
                          {item.status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                          {item.status === "failed" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                          <span className="font-semibold text-foreground">{item.name || "Sem nome"}</span>
                          <span className="text-muted-foreground">({item.phone})</span>
                        </div>
                        <div>
                          {item.status === "pending" && <span className="text-zinc-500">Aguardando</span>}
                          {item.status === "sending" && <span className="text-primary">Enviando...</span>}
                          {item.status === "success" && <span className="text-emerald-500 font-medium">Sucesso</span>}
                          {item.status === "failed" && (
                            <span className="text-red-500 font-medium group relative cursor-pointer">
                              Erro
                              <span className="absolute right-0 bottom-full mb-1 hidden w-48 rounded bg-popover p-1.5 text-[9px] text-popover-foreground shadow group-hover:block z-50">
                                {item.error || "Desconhecido"}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
