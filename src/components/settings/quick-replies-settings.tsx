"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Loader2, Plus, Trash2, Edit2, X, Check, AlertCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

interface QuickReply {
  id: string;
  shortcut: string;
  message: string;
}

export function QuickRepliesSettings() {
  const supabase = createClient();
  const { accountId, canEditSettings } = useAuth();

  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    fetchReplies();
  }, [accountId]);

  async function fetchReplies() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("quick_replies")
        .select("id, shortcut, message")
        .eq("account_id", accountId)
        .order("shortcut", { ascending: true });

      if (error) throw error;
      setReplies(data || []);
    } catch (err: any) {
      console.error("Error loading quick replies:", err);
      toast.error("Falha ao carregar as respostas rápidas");
    } finally {
      setLoading(false);
    }
  }

  // Basic shortcut validation (lowercase alphanumeric only, no spaces or slashes)
  const validateShortcut = (val: string) => {
    return val.toLowerCase().replace(/[^a-z0-9]/g, "");
  };

  const handleShortcutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShortcut(validateShortcut(e.target.value));
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const cleanShortcut = shortcut.trim().toLowerCase();
    const cleanMessage = message.trim();

    if (!accountId || !cleanShortcut || !cleanMessage) return;

    // Check if shortcut already exists (excluding the one being edited)
    const exists = replies.some(
      (r) => r.shortcut === cleanShortcut && r.id !== editingId
    );
    if (exists) {
      toast.error(`O atalho "/${cleanShortcut}" já está cadastrado.`);
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // Update
        const { error } = await supabase
          .from("quick_replies")
          .update({ shortcut: cleanShortcut, message: cleanMessage })
          .eq("id", editingId);

        if (error) throw error;
        toast.success("Resposta rápida atualizada!");
      } else {
        // Insert
        const { error } = await supabase
          .from("quick_replies")
          .insert({
            account_id: accountId,
            shortcut: cleanShortcut,
            message: cleanMessage,
          });

        if (error) throw error;
        toast.success("Resposta rápida cadastrada!");
      }

      setShortcut("");
      setMessage("");
      setEditingId(null);
      setIsAdding(false);
      fetchReplies();
    } catch (err: any) {
      console.error("Error saving quick reply:", err);
      toast.error(err.message || "Erro ao salvar a resposta rápida");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Excluir a resposta rápida "/${name}"?`)) return;

    try {
      const { error } = await supabase.from("quick_replies").delete().eq("id", id);
      if (error) throw error;

      toast.success("Resposta rápida excluída!");
      setReplies((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) {
        handleCancel();
      }
    } catch (err: any) {
      console.error("Error deleting quick reply:", err);
      toast.error("Falha ao excluir");
    }
  }

  const handleEdit = (reply: QuickReply) => {
    setEditingId(reply.id);
    setShortcut(reply.shortcut);
    setMessage(reply.message);
    setIsAdding(true);
  };

  const handleCancel = () => {
    setEditingId(null);
    setShortcut("");
    setMessage("");
    setIsAdding(false);
  };

  return (
    <section className="max-w-3xl space-y-6 animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Respostas Rápidas"
        description="Configure atalhos com '/' para preencher rapidamente mensagens prontas no chat de atendimento."
      />

      {/* Form Card (Add/Edit) */}
      {isAdding && canEditSettings ? (
        <Card className="border-primary/20 bg-muted/20">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <MessageSquare className="size-4 text-primary" />
              {editingId ? "Editar Resposta Rápida" : "Nova Resposta Rápida"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="shortcut-input">Atalho</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                      /
                    </span>
                    <Input
                      id="shortcut-input"
                      placeholder="ex: ola"
                      value={shortcut}
                      onChange={handleShortcutChange}
                      required
                      className="pl-6 h-9"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Apenas letras minúsculas e números.
                  </p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="message-input">Mensagem completa</Label>
                  <textarea
                    id="message-input"
                    placeholder="Escreva a resposta pronta..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    rows={3}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving || !shortcut.trim() || !message.trim()}
                  className="bg-primary text-primary-foreground"
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Check className="size-3.5 mr-1.5" />
                  )}
                  Salvar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        canEditSettings && (
          <Button
            onClick={() => setIsAdding(true)}
            size="sm"
            className="bg-primary text-primary-foreground"
          >
            <Plus className="size-4 mr-2" />
            Adicionar Resposta Rápida
          </Button>
        )
      )}

      {/* List Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <MessageSquare className="size-4 text-primary" />
            Atalhos Cadastrados
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Esses atalhos estarão disponíveis para todos os agentes no inbox de atendimento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
              <Loader2 className="size-5 animate-spin text-primary" />
              Carregando atalhos...
            </div>
          ) : replies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground space-y-2">
              <AlertCircle className="size-8 mx-auto text-muted-foreground/60" />
              <p className="text-sm">Nenhuma resposta rápida cadastrada ainda.</p>
              {canEditSettings && (
                <p className="text-xs">Clique em &quot;Adicionar Resposta Rápida&quot; acima para criar a primeira.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {replies.map((reply) => (
                <div
                  key={reply.id}
                  className="flex items-start justify-between p-4 gap-4 bg-card hover:bg-muted/10 transition-colors"
                >
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      /{reply.shortcut}
                    </span>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {reply.message}
                    </p>
                  </div>
                  {canEditSettings && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEdit(reply)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Editar"
                      >
                        <Edit2 className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(reply.id, reply.shortcut)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Excluir"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
