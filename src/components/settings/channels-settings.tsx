"use client";

import { useState } from "react";
import { 
  MessageSquare, 
  Sparkles, 
  AlertCircle, 
  ArrowRight, 
  CheckCircle2,
  Lock,
  Layers
} from "lucide-react";

function InstagramIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useEffect } from "react";
import { Send, Loader2, Trash2, Phone, ShieldCheck } from "lucide-react";

export function ChannelsSettings() {
  const [connecting, setConnecting] = useState(false);
  const [step, setStep] = useState(0);

  // Telegram Bot States
  const [tgToken, setTgToken] = useState("");
  const [savingTg, setSavingTg] = useState(false);
  const [tgConfigs, setTgConfigs] = useState<any[]>([]);
  const [loadingTg, setLoadingTg] = useState(true);

  // Telegram Phone User Session States
  const [tgPhone, setTgPhone] = useState("");
  const [tgApiId, setTgApiId] = useState("");
  const [tgApiHash, setTgApiHash] = useState("");
  const [tgCode, setTgCode] = useState("");
  const [tgPassword, setTgPassword] = useState("");
  const [phoneStep, setPhoneStep] = useState<"input_phone" | "input_code">("input_phone");
  const [sendingCode, setSendingCode] = useState(false);
  const [loggingInPhone, setLoggingInPhone] = useState(false);
  const [passwordNeeded, setPasswordNeeded] = useState(false);
  const [userSessions, setUserSessions] = useState<any[]>([]);

  const fetchTgConfigs = async () => {
    try {
      const res = await fetch("/api/telegram/config");
      if (res.ok) {
        const data = await res.json();
        setTgConfigs(data.configs || []);
      }
    } catch (err) {
      console.error("Failed to load Telegram configs:", err);
    } finally {
      setLoadingTg(false);
    }
  };

  const fetchUserSessions = async () => {
    try {
      const res = await fetch("/api/telegram/user/sessions");
      if (res.ok) {
        const data = await res.json();
        setUserSessions(data.sessions || []);
      }
    } catch (err) {
      console.error("Failed to load Telegram user sessions:", err);
    }
  };

  useEffect(() => {
    fetchTgConfigs();
    fetchUserSessions();
  }, []);

  const handleSendPhoneCode = async () => {
    if (!tgPhone.trim()) {
      toast.error("Insira seu número de telefone do Telegram com DDD (ex: +5521999999999).");
      return;
    }
    setSendingCode(true);
    try {
      const res = await fetch("/api/telegram/user/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: tgPhone.trim(),
          api_id: tgApiId ? tgApiId.trim() : undefined,
          api_hash: tgApiHash ? tgApiHash.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar código de verificação");
      toast.success("Código enviado! Verifique seu aplicativo do Telegram ou SMS.");
      setPhoneStep("input_code");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar código");
    } finally {
      setSendingCode(false);
    }
  };

  const handleLoginPhone = async () => {
    if (!tgCode.trim()) {
      toast.error("Insira o código de 5 dígitos recebido.");
      return;
    }
    setLoggingInPhone(true);
    try {
      const res = await fetch("/api/telegram/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: tgPhone.trim(),
          code: tgCode.trim(),
          password: tgPassword ? tgPassword.trim() : undefined,
          api_id: tgApiId ? tgApiId.trim() : undefined,
          api_hash: tgApiHash ? tgApiHash.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.passwordNeeded) {
          setPasswordNeeded(true);
        }
        throw new Error(data.error || "Código de verificação incorreto");
      }

      toast.success(`Conta do Telegram (${data.user?.firstName || tgPhone}) conectada com sucesso!`);
      setTgPhone("");
      setTgCode("");
      setTgPassword("");
      setPasswordNeeded(false);
      setPhoneStep("input_phone");
      await fetchUserSessions();
    } catch (err: any) {
      toast.error(err.message || "Erro ao conectar conta do Telegram");
    } finally {
      setLoggingInPhone(false);
    }
  };

  const handleDeleteUserSession = async (id: string) => {
    try {
      const res = await fetch(`/api/telegram/user/sessions?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao desconectar linha do Telegram");
      toast.success("Linha do Telegram desconectada.");
      await fetchUserSessions();
    } catch (err: any) {
      toast.error(err.message || "Falha ao desconectar");
    }
  };

  const handleSaveTelegram = async () => {
    if (!tgToken.trim()) {
      toast.error("Por favor insira um Token de Bot do Telegram válido.");
      return;
    }
    setSavingTg(true);
    try {
      const res = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: tgToken }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao conectar o Bot do Telegram");
      }

      toast.success(`Bot @${data.bot?.username || ""} conectado com sucesso! Webhook ativado.`);
      setTgToken("");
      await fetchTgConfigs();
    } catch (err: any) {
      toast.error(err.message || "Falha na conexão com o Telegram");
    } finally {
      setSavingTg(false);
    }
  };

  const handleDeleteTelegram = async (id: string) => {
    try {
      const res = await fetch(`/api/telegram/config?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao desconectar bot");
      toast.success("Bot desconectado.");
      await fetchTgConfigs();
    } catch (err: any) {
      toast.error(err.message || "Falha ao desconectar");
    }
  };

  const startMockConnection = () => {
    setConnecting(true);
    setTimeout(() => {
      setStep(1);
      setConnecting(false);
    }, 1500);
  };

  const selectPages = () => {
    setConnecting(true);
    setTimeout(() => {
      setStep(2);
      setConnecting(false);
    }, 1200);
  };

  return (
    <section className="max-w-3xl space-y-6 animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Canais de Atendimento & Disparo"
        description="Conecte seu Telegram Bot e suas contas comerciais do Instagram Direct e Facebook Messenger."
      />

      {/* Telegram Integration Card */}
      <Card className="border border-sky-500/30 bg-sky-500/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-sky-500 text-white shadow-md">
              <Send className="size-5" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Telegram Bot API (Oficial)
                <span className="text-[10px] bg-sky-500/20 text-sky-600 dark:text-sky-300 font-mono px-2 py-0.5 rounded-full">
                  100% Gratuito
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Conecte seu Bot do Telegram para receber mensagens no Inbox e realizar disparos em massa.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              Token do Bot (fornecido pelo @BotFather)
            </label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz..."
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                className="text-xs font-mono bg-background"
              />
              <Button
                onClick={handleSaveTelegram}
                disabled={savingTg}
                size="sm"
                className="bg-sky-600 hover:bg-sky-700 text-white font-medium shrink-0"
              >
                {savingTg ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Send className="size-3.5 mr-1" />}
                Conectar Bot
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Abra o Telegram, pesquise por <code className="text-sky-600 dark:text-sky-400">@BotFather</code> e use o comando <code className="text-sky-600 dark:text-sky-400">/newbot</code> para obter seu token.
            </p>
          </div>

          {tgConfigs.length > 0 && (
            <div className="pt-3 border-t border-sky-500/20 space-y-2">
              <h5 className="text-xs font-semibold text-foreground">Bots Conectados:</h5>
              {tgConfigs.map((cfg) => (
                <div key={cfg.id} className="flex items-center justify-between p-2.5 rounded-lg border border-sky-500/20 bg-background/80 text-xs shadow-sm">
                  <div className="flex items-center gap-2">
                    <Send className="size-4 text-sky-500 shrink-0" />
                    <div>
                      <span className="font-semibold text-foreground">{cfg.bot_name}</span>
                      <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">(@{cfg.bot_username})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="size-3" /> Webhook Ativo
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteTelegram(cfg.id)}
                      className="size-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                      title="Desconectar Bot"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telegram Phone User API Card */}
      <Card className="border border-blue-500/30 bg-blue-500/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
              <Phone className="size-5" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Telegram por Número (Linha Pessoal / Comercial)
                <span className="text-[10px] bg-blue-500/20 text-blue-600 dark:text-blue-300 font-mono px-2 py-0.5 rounded-full">
                  Disparo Direto por Telefone
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Conecte seu número de celular para abordar contatos diretamente pelo número de telefone no Telegram.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {phoneStep === "input_phone" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">
                    API ID do Telegram (obtenha em my.telegram.org)
                  </label>
                  <Input
                    type="text"
                    placeholder="ex: 24981928"
                    value={tgApiId}
                    onChange={(e) => setTgApiId(e.target.value)}
                    className="text-xs font-mono bg-background"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">
                    API Hash do Telegram
                  </label>
                  <Input
                    type="password"
                    placeholder="ex: a3f89028..."
                    value={tgApiHash}
                    onChange={(e) => setTgApiHash(e.target.value)}
                    className="text-xs font-mono bg-background"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Número de Celular com DDD (formato internacional, ex: +5521999999999)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="+5521999999999"
                    value={tgPhone}
                    onChange={(e) => setTgPhone(e.target.value)}
                    className="text-xs font-mono bg-background"
                  />
                  <Button
                    onClick={handleSendPhoneCode}
                    disabled={sendingCode}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium shrink-0"
                  >
                    {sendingCode ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Send className="size-3.5 mr-1" />}
                    Enviar Código SMS/App
                  </Button>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Para obter seu API ID e API Hash gratuitamente em 30 segundos: acesse <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium">my.telegram.org</a>, faça login com seu celular e clique em <strong>API development tools</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-3 p-3 rounded-lg border border-blue-500/20 bg-background/80">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Número: {tgPhone}</span>
                <Button variant="ghost" size="sm" onClick={() => setPhoneStep("input_phone")} className="h-6 text-[11px]">
                  Trocar Número
                </Button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Código de 5 dígitos (recebido no Telegram ou SMS):
                </label>
                <Input
                  type="text"
                  placeholder="12345"
                  value={tgCode}
                  onChange={(e) => setTgCode(e.target.value)}
                  className="text-xs font-mono bg-background"
                />
              </div>

              {passwordNeeded && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-medium text-amber-500 flex items-center gap-1">
                    <ShieldCheck className="size-3.5" /> Senha da Verificação em Duas Etapas (2FA):
                  </label>
                  <Input
                    type="password"
                    placeholder="Sua senha do Telegram"
                    value={tgPassword}
                    onChange={(e) => setTgPassword(e.target.value)}
                    className="text-xs bg-background"
                  />
                </div>
              )}

              <Button
                onClick={handleLoginPhone}
                disabled={loggingInPhone}
                size="sm"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                {loggingInPhone ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <CheckCircle2 className="size-3.5 mr-1" />}
                Confirmar e Conectar Linha
              </Button>
            </div>
          )}

          {userSessions.length > 0 && (
            <div className="pt-3 border-t border-blue-500/20 space-y-2">
              <h5 className="text-xs font-semibold text-foreground">Linhas Telefônicas Conectadas:</h5>
              {userSessions.map((sess) => (
                <div key={sess.id} className="flex items-center justify-between p-2.5 rounded-lg border border-blue-500/20 bg-background/80 text-xs shadow-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-blue-500 shrink-0" />
                    <div>
                      <span className="font-semibold text-foreground">{sess.first_name || sess.phone_number}</span>
                      <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">({sess.phone_number})</span>
                      {sess.username && <span className="text-sky-500 ml-1 text-[11px]">@{sess.username}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="size-3" /> Ativo por Número
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteUserSession(sess.id)}
                      className="size-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                      title="Desconectar Linha"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3.5 py-2.5 text-xs text-primary font-medium w-fit">
        <Sparkles className="size-4 shrink-0 animate-pulse" />
        Esta integração está atualmente em fase de teste fechado (Beta).
      </div>

      {step === 0 && (
        <Card className="border border-border/80">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 text-white shadow-md">
                  <InstagramIcon className="size-4.5" />
                </div>
                <div className="flex size-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
                  <FacebookIcon className="size-4.5" />
                </div>
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">
                  Conexão de Canais Meta
                </CardTitle>
                <CardDescription className="text-xs">
                  Integre mensagens diretas do Instagram e do Messenger no seu CRM.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <InstagramIcon className="size-5 text-pink-500" />
                  <h4 className="text-xs font-semibold">Instagram Direct</h4>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Receba mensagens diretas, menções em stories e replies de comentários em tempo real.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <FacebookIcon className="size-5 text-blue-500" />
                  <h4 className="text-xs font-semibold">Facebook Messenger</h4>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Conecte as mensagens de chat da sua página do Facebook diretamente no fluxo de atendimento.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Lock className="size-3.5 text-muted-foreground/80" />
                Conexão criptografada via Meta OAuth.
              </div>
              <Button 
                onClick={startMockConnection} 
                disabled={connecting}
                size="sm"
                className="bg-primary text-primary-foreground font-semibold hover:bg-primary/95"
              >
                {connecting ? "Carregando..." : "Conectar com Facebook"}
                <ArrowRight className="size-3.5 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card className="border-primary/20 bg-muted/20">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              Selecionar Páginas e Contas
            </CardTitle>
            <CardDescription className="text-xs">
              Escolha quais páginas do Facebook e contas do Instagram você deseja integrar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-card">
                <div className="flex items-center gap-3">
                  <FacebookIcon className="size-5 text-blue-500" />
                  <div>
                    <p className="text-xs font-semibold">Página Principal de Suporte</p>
                    <p className="text-[10px] text-muted-foreground">ID: 1083920194857</p>
                  </div>
                </div>
                <input type="checkbox" defaultChecked className="rounded border-border text-primary focus:ring-primary size-4" />
              </div>

              <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-card">
                <div className="flex items-center gap-3">
                  <InstagramIcon className="size-5 text-pink-500" />
                  <div>
                    <p className="text-xs font-semibold">@sua.marca.comercial</p>
                    <p className="text-[10px] text-muted-foreground">Instagram Business</p>
                  </div>
                </div>
                <input type="checkbox" defaultChecked className="rounded border-border text-primary focus:ring-primary size-4" />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                Voltar
              </Button>
              <Button size="sm" onClick={selectPages} disabled={connecting}>
                {connecting ? "Salvando..." : "Concluir Integração"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-500" />
              Integração Conectada com Sucesso!
            </CardTitle>
            <CardDescription className="text-xs">
              Sua conta Meta foi sincronizada com a fase Beta do CRM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-border text-xs">
                <span className="text-muted-foreground">Páginas Conectadas:</span>
                <span className="font-medium text-foreground">1 Página, 1 Conta Instagram</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border text-xs">
                <span className="text-muted-foreground">Status do Webhook:</span>
                <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  Ativo (Beta)
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setStep(0)}>
                Refazer Conexão
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <AlertCircle className="size-4 text-primary" />
            Configurações Técnicas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
          <p>
            Para receber mensagens do Instagram Direct, certifique-se de que a opção 
            <strong> &quot;Permitir acesso às mensagens&quot;</strong> está ativada nas configurações da sua conta comercial do Instagram (Configurações → Privacidade → Mensagens).
          </p>
          <p>
            As mensagens enviadas por esses canais obedecem às mesmas regras de distribuição e automação do seu espaço de trabalho do WhatsApp.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
