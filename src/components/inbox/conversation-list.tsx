"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus } from "@/types";
import { Search, ChevronDown, Pin, PinOff, Tag as TagIcon, Kanban, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  resyncToken?: number;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  closed: "bg-muted-foreground",
};

type InboxFilter = ConversationStatus | "all" | "unread";

const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Não lidos", value: "unread" },
  { label: "Abertos", value: "open" },
  { label: "Pendentes", value: "pending" },
  { label: "Fechados", value: "closed" },
];

import { useAuth } from "@/hooks/use-auth";

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const { user, accountRole } = useAuth();
  const isConsultant = accountRole === "agent" || accountRole === "viewer";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectedLine, setSelectedLine] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [configs, setConfigs] = useState<any[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [allStages, setAllStages] = useState<{ id: string; name: string; pipelineName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const loadDrafts = useCallback(() => {
    const newDrafts: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("wacrm:draft:")) {
          const conversationId = key.replace("wacrm:draft:", "");
          const value = localStorage.getItem(key);
          if (value) {
            newDrafts[conversationId] = value;
          }
        }
      }
    } catch (err) {
      console.error("Failed to load drafts:", err);
    }
    setDrafts(newDrafts);
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [activeConversationId, loadDrafts]);

  // Fetch metadata (configs, tags, pipelines) for dropdown filters
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();

        // 1. Fetch configs
        const res = await fetch("/api/whatsapp/config");
        const data = await res.json();
        setConfigs(data.configs || []);

        // 2. Fetch tags
        const { data: tagsData } = await supabase.from("tags").select("id, name, color").order("name");
        setTags(tagsData ?? []);

        // 3. Fetch pipelines & stages
        const { data: pipelinesData } = await supabase
          .from("pipelines")
          .select("id, name, pipeline_stages(id, name, position)");

        const stagesList: { id: string; name: string; pipelineName: string }[] = [];
        pipelinesData?.forEach((p: any) => {
          const sorted = [...(p.pipeline_stages || [])].sort((a, b) => a.position - b.position);
          sorted.forEach((s: any) => {
            stagesList.push({ id: s.id, name: s.name, pipelineName: p.name });
          });
        });
        setAllStages(stagesList);
      } catch (err) {
        console.error("Failed to load metadata for filters:", err);
      }
    })();
  }, []);

  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      let query = supabase
        .from("conversations")
        .select("*, contact:contacts(*, contact_tags(tag:tags(id, name, color)), deals(id, stage_id, stage:pipeline_stages(id, name, pipeline:pipelines(id, name))))")
        .order("last_message_at", { ascending: false });

      if (isConsultant && user?.id) {
        query = query.or(`assigned_agent_id.is.null,assigned_agent_id.eq.${user.id}`);
      }

      const { data, error } = await query;

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch conversations:", error);
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [resyncToken, isConsultant, user?.id]);

  const handleTogglePin = useCallback(async (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    const newPinned = !conv.is_pinned;
    const supabase = createClient();

    onConversationsLoadedRef.current(
      conversations.map((c) => (c.id === conv.id ? { ...c, is_pinned: newPinned } : c))
    );

    const { error } = await supabase
      .from("conversations")
      .update({ is_pinned: newPinned })
      .eq("id", conv.id);

    if (error) {
      console.error("Failed to pin conversation:", error);
      toast.error("Erro ao fixar conversa");
    } else {
      toast.success(newPinned ? "Conversa fixada no topo!" : "Conversa desfixada");
    }
  }, [conversations]);

  const filtered = useMemo(() => {
    let result = [...conversations];

    // Sort by is_pinned first (pinned conversations float to top), then last_message_at descending
    result.sort((a, b) => {
      const pinA = a.is_pinned ? 1 : 0;
      const pinB = b.is_pinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;

      const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return timeB - timeA;
    });

    if (filter === "unread") {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter !== "all") {
      result = result.filter((c) => c.status === filter);
    }

    if (selectedLine !== "all") {
      result = result.filter((c) => c.waha_session === selectedLine);
    }

    if (selectedTag !== "all") {
      result = result.filter((c) => {
        const contactTags = (c.contact as any)?.contact_tags || [];
        return contactTags.some((ct: any) => ct.tag?.name === selectedTag || ct.tag?.id === selectedTag);
      });
    }

    if (selectedStage !== "all") {
      result = result.filter((c) => {
        const deals = (c.contact as any)?.deals || [];
        return deals.some((d: any) => d.stage_id === selectedStage || d.stage?.id === selectedStage);
      });
    }

    if (isConsultant && user?.id) {
      result = result.filter(
        (c) => !c.assigned_agent_id || c.assigned_agent_id === user.id
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [conversations, filter, selectedLine, selectedTag, selectedStage, search, isConsultant, user?.id]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);

  return (
    // w-full on mobile so the list occupies the whole viewport when it's
    // the single pane showing; fixed 320px on desktop where it shares the
    // row with the thread + contact sidebar.
    <div className="flex h-full w-full flex-col border-r border-border bg-card lg:w-80">
      {/* Search + Filter */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder="Buscar conversas..."
            className="border-border bg-muted pl-9 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg bg-muted/60 hover:bg-muted border border-border/50 shrink-0 font-medium transition-colors">
                Status: {activeFilter?.label ?? "Todos"}
                <ChevronDown className="h-3 w-3 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "text-sm",
                    filter === opt.value
                      ? "text-primary font-semibold"
                      : "text-popover-foreground"
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {configs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg bg-muted/60 hover:bg-muted border border-border/50 shrink-0 font-medium transition-colors max-w-[150px]">
                {selectedLine !== "all" && (
                  <span
                    className={cn(
                      "size-2 rounded-full shrink-0",
                      configs.find(c => c.waha_session === selectedLine)?.connected
                        ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                        : "bg-rose-500"
                    )}
                  />
                )}
                <span className="truncate">
                  Linha: {selectedLine === "all" ? "Todas" : (configs.find(c => c.waha_session === selectedLine)?.phone_info?.display_phone_number || selectedLine)}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="border-border bg-popover min-w-[200px]"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedLine("all")}
                  className={cn(
                    "text-xs cursor-pointer py-2",
                    selectedLine === "all" ? "text-primary font-semibold bg-primary/10" : "text-popover-foreground"
                  )}
                >
                  Todas as Linhas
                </DropdownMenuItem>
                {configs.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => setSelectedLine(c.waha_session)}
                    className={cn(
                      "text-xs cursor-pointer flex items-center justify-between gap-3 py-2",
                      selectedLine === c.waha_session ? "text-primary font-semibold bg-primary/10" : "text-popover-foreground"
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className={cn(
                          "size-2 rounded-full shrink-0",
                          c.connected
                            ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                            : "bg-rose-500"
                        )}
                      />
                      <span className="truncate">{c.phone_info?.display_phone_number || c.waha_session}</span>
                    </span>
                    <span
                      className={cn(
                        "text-[9px] uppercase px-1.5 py-0.5 rounded font-mono shrink-0",
                        c.connected
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                      )}
                    >
                      {c.connected ? "Ativa" : "Inativa"}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg bg-muted/60 hover:bg-muted border border-border/50 shrink-0 font-medium transition-colors max-w-[130px]">
                Tag: {selectedTag === "all" ? "Todas" : selectedTag}
                <ChevronDown className="h-3 w-3 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="border-border bg-popover max-h-60 overflow-y-auto">
                <DropdownMenuItem onClick={() => setSelectedTag("all")} className={cn("text-sm", selectedTag === "all" ? "text-primary font-semibold" : "text-popover-foreground")}>
                  Todas as Tags
                </DropdownMenuItem>
                {tags.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => setSelectedTag(t.name)} className={cn("text-sm flex items-center gap-1.5", selectedTag === t.name ? "text-primary font-semibold" : "text-popover-foreground")}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#888" }} />
                    {t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {allStages.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg bg-muted/60 hover:bg-muted border border-border/50 shrink-0 font-medium transition-colors max-w-[140px]">
                Etapa: {selectedStage === "all" ? "Todas" : (allStages.find(s => s.id === selectedStage)?.name || "Selecionada")}
                <ChevronDown className="h-3 w-3 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="border-border bg-popover max-h-60 overflow-y-auto">
                <DropdownMenuItem onClick={() => setSelectedStage("all")} className={cn("text-sm", selectedStage === "all" ? "text-primary font-semibold" : "text-popover-foreground")}>
                  Todas as Etapas
                </DropdownMenuItem>
                {allStages.map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => setSelectedStage(s.id)} className={cn("text-sm flex flex-col items-start", selectedStage === s.id ? "text-primary font-semibold" : "text-popover-foreground")}>
                    <span>{s.name}</span>
                    <span className="text-[10px] text-muted-foreground">{s.pipelineName}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                draftText={drafts[conv.id]}
                onSelect={handleSelect}
                onTogglePin={handleTogglePin}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  draftText?: string;
  onSelect: (conversation: Conversation) => void;
  onTogglePin?: (e: React.MouseEvent, conversation: Conversation) => void;
}

const SENTIMENT_ICONS: Record<string, { emoji: string; color: string; label: string }> = {
  positive: { emoji: "😊", color: "text-emerald-500", label: "Sentimento: Positivo" },
  neutral: { emoji: "😐", color: "text-slate-400", label: "Sentimento: Neutro" },
  negative: { emoji: "😠", color: "text-rose-500", label: "Sentimento: Negativo" },
  mixed: { emoji: "🧐", color: "text-amber-500", label: "Sentimento: Misto" },
};

function ConversationItem({
  conversation,
  isActive,
  draftText,
  onSelect,
  onTogglePin,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || "Desconhecido";
  const initials = displayName.charAt(0).toUpperCase();

  const contactTags = (contact as any)?.contact_tags || [];
  const deals = (contact as any)?.deals || [];
  const currentDeal = deals[0];
  const stageName = currentDeal?.stage?.name;

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
        .replace("about", "")
        .replace("less than a minute", "agora")
        .replace("minute", "min")
        .replace("hours", "h")
        .replace("hour", "h")
        .replace("days", "d")
        .replace("day", "d")
    : "";

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group/item relative flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer border-b border-border/30",
        isActive && "border-l-2 border-primary bg-muted/70"
      )}
    >
      {/* Avatar */}
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
        {(conversation as any).channel === 'telegram' && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-white text-[8px] shadow">
            <Send className="h-2.5 w-2.5" />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {conversation.is_pinned && (
              <span title="Conversa Fixada">
                <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500 fill-amber-500" />
              </span>
            )}
            <span className="truncate text-sm font-medium text-foreground">
              {displayName}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
            <button
              type="button"
              onClick={(e) => onTogglePin?.(e, conversation)}
              className={cn(
                "p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-opacity",
                conversation.is_pinned ? "opacity-100 text-amber-500" : "opacity-0 group-hover/item:opacity-100"
              )}
              title={conversation.is_pinned ? "Desfixar conversa" : "Fixar conversa no topo"}
            >
              {conversation.is_pinned ? (
                <PinOff className="h-3.5 w-3.5" />
              ) : (
                <Pin className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Badges: Line, Stage, Tags */}
        <div className="mt-1 flex flex-wrap gap-1 items-center">
          {(conversation as any).channel === 'telegram' ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-500 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 leading-none select-none">
              <Send className="h-2.5 w-2.5" /> Telegram
            </span>
          ) : (conversation as any).waha_session ? (
            <span className="inline-block text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 leading-none select-none">
              {(conversation as any).waha_session}
            </span>
          ) : null}

          {stageName && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 leading-none">
              <Kanban className="h-2.5 w-2.5" />
              {stageName}
            </span>
          )}

          {contactTags.slice(0, 2).map((ct: any) => (
            <span
              key={ct.tag?.id || ct.id}
              className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded border leading-none"
              style={{
                backgroundColor: (ct.tag?.color || '#888888') + '15',
                borderColor: (ct.tag?.color || '#888888') + '40',
                color: ct.tag?.color || 'currentColor'
              }}
            >
              <TagIcon className="h-2.5 w-2.5" />
              {ct.tag?.name}
            </span>
          ))}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          {draftText ? (
            <p className="truncate text-xs text-amber-500 font-medium">
              <span className="font-semibold">[Rascunho]:</span> {draftText}
            </p>
          ) : (
            <p className="truncate text-xs text-muted-foreground">
              {conversation.last_message_text || "Nenhuma mensagem ainda"}
            </p>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {/* Sentiment Emoji */}
            {conversation.sentiment && conversation.sentiment !== "unknown" && (
              <span
                className={cn("text-xs leading-none select-none", SENTIMENT_ICONS[conversation.sentiment]?.color)}
                title={SENTIMENT_ICONS[conversation.sentiment]?.label}
              >
                {SENTIMENT_ICONS[conversation.sentiment]?.emoji}
              </span>
            )}

            {conversation.unread_count > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conversation.unread_count}
              </span>
            )}
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                STATUS_COLORS[conversation.status]
              )}
              title={conversation.status}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
