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

export function ChannelsSettings() {
  const [connecting, setConnecting] = useState(false);
  const [step, setStep] = useState(0);

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
        title="Instagram & Messenger"
        description="Conecte suas contas comerciais do Instagram Direct e do Facebook Messenger em um inbox unificado."
      />

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
