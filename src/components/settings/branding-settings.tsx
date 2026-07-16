"use client";

import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { Building, Loader2, Upload, Trash2, Sparkles, Image, Globe } from "lucide-react";

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

export function BrandingSettings() {
  const supabase = createClient();
  const {
    accountId,
    account,
    canEditSettings,
    profileLoading,
    refreshProfile,
  } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [crmName, setCrmName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const ALLOWED_MIME = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ]);
  const MAX_LOGO_BYTES = 2 * 1024 * 1024;

  useEffect(() => {
    if (account?.name) {
      setCrmName(account.name);
    }
  }, [account?.name]);

  const nameDirty = account?.name ? crmName.trim() !== account.name : crmName.trim() !== "";

  async function handleSaveName() {
    const trimmed = crmName.trim();
    if (!accountId || !trimmed || !nameDirty) return;
    setSavingName(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Falha ao salvar o nome");
      }

      await refreshProfile();
      toast.success("Nome do CRM atualizado com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar o nome");
    } finally {
      setSavingName(false);
    }
  }

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accountId) return;

    if (!ALLOWED_MIME.has(file.type)) {
      toast.error("Tipo de imagem não suportado", {
        description: "Use PNG, JPG, WebP ou GIF.",
      });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Imagem muito grande", {
        description: "Tamanho máximo permitido: 2 MB.",
      });
      return;
    }

    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${accountId}/logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(`Upload falhou: ${uploadError.message}`);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("logos").getPublicUrl(path);

      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_url: publicUrl }),
      });

      if (!res.ok) {
        throw new Error("Falha ao salvar a nova logo");
      }

      await refreshProfile();
      toast.success("Logotipo atualizado com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer upload da logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const onRemoveLogo = async () => {
    if (!accountId) return;
    setUploadingLogo(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_url: null }),
      });

      if (!res.ok) {
        throw new Error("Falha ao remover a logo");
      }

      await refreshProfile();
      toast.success("Logotipo removido!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <section className="max-w-3xl space-y-6 animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Marca e Identidade"
        description="Personalize o nome do seu workspace, logotipo e favicon do navegador em um único lugar."
      />

      {/* CRM Name Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Building className="size-4 text-primary" />
            Nome do CRM / Workspace
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Altere o nome exibido no cabeçalho, menu lateral e convites de novos membros.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="crm-name" className="text-muted-foreground">
              Nome do Workspace
            </Label>
            <Input
              id="crm-name"
              type="text"
              value={crmName}
              onChange={(e) => setCrmName(e.target.value)}
              disabled={!canEditSettings || profileLoading || savingName}
              placeholder="Digite o nome do seu CRM"
              maxLength={80}
              className="h-9 w-full bg-muted border-border"
            />
            {!canEditSettings && (
              <p className="text-xs text-muted-foreground">
                Apenas administradores podem alterar o nome do CRM.
              </p>
            )}
          </div>

          {canEditSettings && (
            <Button
              onClick={handleSaveName}
              disabled={savingName || !nameDirty || !crmName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {savingName ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                "Salvar Nome"
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Logo & Favicon Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Image className="size-4 text-primary" />
            Logotipo do CRM e Favicon
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Envie o logotipo da sua empresa. A imagem será exibida no menu lateral e também será sincronizada automaticamente como o ícone (Favicon) da aba do navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-border bg-muted overflow-hidden">
              {account?.logo_url ? (
                <img
                  src={account.logo_url}
                  alt={account.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <Image className="h-8 w-8 text-muted-foreground/60" />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={onPickLogo}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  className="hidden"
                  disabled={!canEditSettings || uploadingLogo}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!canEditSettings || uploadingLogo}
                  className="flex items-center gap-2"
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Enviar imagem
                </Button>

                {account?.logo_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onRemoveLogo}
                    disabled={!canEditSettings || uploadingLogo}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Tamanho máximo de 2 MB. Formatos suportados: PNG, JPG, WebP ou GIF.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Favicon & Title Sync Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Globe className="size-4 text-primary" />
            Sincronização com o Navegador
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Como sua identidade é sincronizada com a aba do navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Ícone (Favicon):</strong> Ao definir um logotipo customizado acima, ele se tornará o favicon de todas as páginas do CRM automaticamente em tempo real.
          </p>
          <p>
            <strong>Título da Aba:</strong> O nome do CRM customizado é anexado ao final do título da página (ex: <i>Dashboard — {account?.name || "Nome do CRM"}</i>) e atualiza conforme você altera as seções.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
