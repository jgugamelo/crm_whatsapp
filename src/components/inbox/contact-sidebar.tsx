"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Phone,
  Mail,
  Copy,
  Check,
  User,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  Brain,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Contact, Deal, ContactNote, Tag, Conversation } from "@/types";
import { format } from "date-fns";
import { toast } from "sonner";

interface ContactSidebarProps {
  contact: Contact | null;
  conversation: Conversation | null;
  onUpdateConversation?: (updates: Partial<Conversation>) => void;
  onUpdateContact?: (contact: Contact) => void;
  onUseSuggestion?: (suggestionText: string) => void;
}

export function ContactSidebar({
  contact,
  conversation,
  onUpdateConversation,
  onUpdateContact,
  onUseSuggestion,
}: ContactSidebarProps) {
  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [allAvailableTags, setAllAvailableTags] = useState<Tag[]>([]);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestedReply, setSuggestedReply] = useState<string>("");
  const [generatingReply, setGeneratingReply] = useState<boolean>(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (contact) {
      setEditName(contact.name || contact.phone || "");
    }
  }, [contact]);

  const handleSaveName = async () => {
    if (!contact || !editName.trim()) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("contacts")
        .update({ name: editName.trim() })
        .eq("id", contact.id);

      if (error) throw error;

      onUpdateContact?.({
        ...contact,
        name: editName.trim(),
      });
      setIsEditingName(false);
      toast.success("Nome do contato atualizado!");
    } catch (err: any) {
      console.error("Failed to update contact name:", err);
      toast.error("Erro ao atualizar nome do contato");
    }
  };

  const conversationId = conversation?.id;
  const loadedConvIdRef = useRef<string | null>(null);

  const handleAnalyzeSentiment = useCallback(async () => {
    if (!conversationId) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/sentiment`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onUpdateConversation?.({ sentiment: data.sentiment });
      } else {
        console.error("Failed to analyze sentiment:", data.error || "Unknown error");
      }
    } catch (err) {
      console.error("Error analyzing sentiment:", err);
    } finally {
      setAnalyzing(false);
    }
  }, [conversationId, onUpdateConversation]);

  const handleGenerateReplySuggestion = useCallback(async () => {
    if (!conversationId) return;
    setGeneratingReply(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/suggest-reply`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success && data.suggestion) {
        setSuggestedReply(data.suggestion);
      }
    } catch (err) {
      console.error("Error generating reply suggestion:", err);
    } finally {
      setGeneratingReply(false);
    }
  }, [conversationId]);

  // Auto-analyze sentiment and generate reply suggestion ONCE per conversation ID
  useEffect(() => {
    if (!conversationId) return;
    if (loadedConvIdRef.current === conversationId) return;
    loadedConvIdRef.current = conversationId;

    setSuggestedReply(""); // Reset suggestion when switching conversations

    if (!conversation?.sentiment || conversation.sentiment === "unknown") {
      handleAnalyzeSentiment();
    }
    handleGenerateReplySuggestion();
  }, [conversationId, conversation?.sentiment, handleAnalyzeSentiment, handleGenerateReplySuggestion]);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, tags, and all account tags in parallel
    const [dealsRes, notesRes, tagsRes, allTagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
      supabase
        .from("tags")
        .select("*")
        .order("name"),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (allTagsRes.data) setAllAvailableTags(allTagsRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  const handleAddExistingTag = async (tagId: string) => {
    if (!contact) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("contact_tags")
        .insert({ contact_id: contact.id, tag_id: tagId });

      if (error) throw error;

      fetchContactData();
      toast.success("Etiqueta adicionada!");
    } catch (err: any) {
      console.error("Error adding tag:", err);
      toast.error("Erro ao adicionar etiqueta ao contato");
    }
  };

  const handleRemoveTag = async (contactTagId: string) => {
    if (!contact) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("contact_tags")
        .delete()
        .eq("id", contactTagId);

      if (error) throw error;

      setTags((prev) => prev.filter((t) => t.contact_tag_id !== contactTagId));
      toast.success("Etiqueta removida");
    } catch (err: any) {
      console.error("Error removing tag:", err);
      toast.error("Erro ao remover etiqueta");
    }
  };

  const handleCreateAndAddTag = async () => {
    if (!contact || !newTagName.trim()) return;
    try {
      const supabase = createClient();
      const { data: createdTag, error: createError } = await supabase
        .from("tags")
        .insert({
          name: newTagName.trim(),
          color: newTagColor,
        })
        .select()
        .single();

      if (createError) throw createError;

      await handleAddExistingTag(createdTag.id);
      setNewTagName("");
    } catch (err: any) {
      console.error("Error creating tag:", err);
      toast.error("Erro ao criar etiqueta");
    }
  };

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            {isEditingName ? (
              <div className="mt-3 flex items-center gap-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      await handleSaveName();
                    } else if (e.key === "Escape") {
                      setIsEditingName(false);
                      setEditName(displayName);
                    }
                  }}
                  className="max-w-[160px] rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-primary"
                  onClick={handleSaveName}
                >
                  Salvar
                </Button>
              </div>
            ) : (
              <div 
                className="group mt-3 flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-80"
                onClick={() => setIsEditingName(true)}
                title="Clique para editar o nome"
              >
                <h3 className="text-sm font-semibold text-foreground group-hover:text-primary">
                  {displayName}
                </h3>
                <svg
                  className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
            )}
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Sentiment Analysis Card */}
          {conversation && (
            <div className="rounded-xl border border-border bg-card/50 p-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                  Análise de Sentimento (IA)
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
                  disabled={analyzing}
                  onClick={handleAnalyzeSentiment}
                  title="Reanalisar conversa com IA"
                >
                  <RefreshCw className={cn("h-3 w-3", analyzing && "animate-spin")} />
                </Button>
              </div>

              {/* Sentiment Display */}
              {(() => {
                const SENTIMENT_CONFIG: Record<
                  string,
                  { emoji: string; color: string; label: string; bg: string; border: string; desc: string }
                > = {
                  positive: {
                    emoji: "😊",
                    color: "text-emerald-500",
                    bg: "bg-emerald-500/10",
                    border: "border-emerald-500/20",
                    label: "Positivo",
                    desc: "Aproveite a boa receptividade! Mantenha o atendimento ágil e conduza para o fechamento de forma objetiva."
                  },
                  neutral: {
                    emoji: "😐",
                    color: "text-slate-400",
                    bg: "bg-slate-500/10",
                    border: "border-slate-500/20",
                    label: "Neutro",
                    desc: "Cliente direto e formal. Responda de forma clara, profissional, focada em solucionar as dúvidas sem enrolação."
                  },
                  negative: {
                    emoji: "😡",
                    color: "text-rose-500",
                    bg: "bg-rose-500/10",
                    border: "border-rose-500/20",
                    label: "Negativo",
                    desc: "Atenção: cliente insatisfeito! Aja de forma muito empática e paciente. Foque em priorizar a resolução do problema dele."
                  },
                  mixed: {
                    emoji: "😕",
                    color: "text-amber-500",
                    bg: "bg-amber-500/10",
                    border: "border-amber-500/20",
                    label: "Misto",
                    desc: "Tons variados de satisfação/insatisfação. Seja paciente para desfazer mal-entendidos e reforce os pontos positivos da proposta."
                  },
                  unknown: {
                    emoji: "❔",
                    color: "text-muted-foreground",
                    bg: "bg-muted",
                    border: "border-border",
                    label: "Não Analisado",
                    desc: "Clique no botão de recarregar acima para analisar a conversa e receber recomendações de atendimento."
                  }
                };
                const currentSentiment = conversation.sentiment || "unknown";
                const config = SENTIMENT_CONFIG[currentSentiment] || SENTIMENT_CONFIG.unknown;
                return (
                  <div className="mt-3">
                    <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium", config.bg, config.border, config.color)}>
                      <span className="text-lg leading-none select-none">{config.emoji}</span>
                      <span className="flex-1">{config.label}</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      {config.desc}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Sugestão de Resposta (IA) */}
          {conversation && (
            <div className="mt-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 shadow-xs transition-all hover:border-amber-500/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>SUGESTÃO DE RESPOSTA (IA)</span>
                </div>
                <button
                  onClick={handleGenerateReplySuggestion}
                  disabled={generatingReply}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                  title="Gerar nova sugestão de resposta"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", generatingReply && "animate-spin")} />
                </button>
              </div>

              <div className="mt-2.5">
                {generatingReply ? (
                  <div className="rounded-lg border border-dashed border-amber-500/30 bg-background/50 p-3 text-center text-xs text-muted-foreground animate-pulse">
                    Analisando a conversa e gerando resposta para quebrar objeções...
                  </div>
                ) : suggestedReply ? (
                  <div className="space-y-2.5">
                    <div className="rounded-lg border border-border/80 bg-background/80 p-2.5 text-xs text-foreground leading-relaxed whitespace-pre-wrap select-text">
                      {suggestedReply}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        onUseSuggestion?.(suggestedReply);
                        toast.success("Sugestão copiada para o chat! 💬");
                      }}
                      className="w-full h-8 text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-xs gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Usar na conversa 💬
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-background/50 p-3 text-center text-xs text-muted-foreground">
                    Clique no botão de recarregar acima para gerar uma sugestão de resposta com IA.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <div className="flex items-center gap-2">
                <TagIcon className="h-3.5 w-3.5" />
                Etiquetas
              </div>

              {/* Add Tag Popover */}
              <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                <PopoverTrigger
                  className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Gerenciar etiquetas"
                >
                  <Plus className="h-3.5 w-3.5" />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3 border-border bg-popover space-y-3 shadow-md">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-semibold text-foreground">Etiquetas do Contato</h4>
                    <p className="text-[10px] text-muted-foreground">Clique para adicionar ou remover</p>
                  </div>

                  {/* Available Tags list */}
                  <div className="max-h-36 overflow-y-auto space-y-1 border border-border/50 rounded-md p-1 bg-muted/20">
                    {allAvailableTags.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground py-2 text-center">Nenhuma tag criada ainda</p>
                    ) : (
                      allAvailableTags.map((t) => {
                        const isAttached = tags.some((attached) => attached.id === t.id);
                        const attachedObj = tags.find((attached) => attached.id === t.id);

                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              if (isAttached && attachedObj) {
                                handleRemoveTag(attachedObj.contact_tag_id);
                              } else {
                                handleAddExistingTag(t.id);
                              }
                            }}
                            className={cn(
                              "flex w-full items-center justify-between px-2 py-1 text-xs rounded transition-colors text-left",
                              isAttached ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"
                            )}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color || "#3b82f6" }} />
                              <span className="truncate">{t.name}</span>
                            </div>
                            {isAttached && <Check className="h-3 w-3 shrink-0 text-primary" />}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Create New Tag */}
                  <div className="border-t border-border/60 pt-2 space-y-2">
                    <span className="text-[11px] font-medium text-foreground block">Criar Nova Tag</span>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Nome da tag..."
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none"
                      />
                      <input
                        type="color"
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        className="h-7 w-7 rounded border border-input p-0.5 cursor-pointer bg-background"
                        title="Cor da Tag"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={handleCreateAndAddTag}
                      disabled={!newTagName.trim()}
                    >
                      Criar e Adicionar
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Display Attached Tags */}
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Sem etiquetas</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border"
                    style={{
                      backgroundColor: `${tag.color || "#3b82f6"}20`,
                      borderColor: `${tag.color || "#3b82f6"}40`,
                      color: tag.color || "currentColor",
                    }}
                  >
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag.contact_tag_id)}
                      className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5 transition-colors"
                      title="Remover etiqueta"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Negócios Ativos
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Sem negócios</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              Notas
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Adicionar uma nota..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
