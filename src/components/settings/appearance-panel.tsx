"use client";

import { Check, Moon, Palette, SunMoon, Sun, Image, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useTheme } from "@/hooks/use-theme";
import { MODES, THEMES, type Mode, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

/**
 * Appearance panel — light/dark mode + accent-color picker.
 *
 * Two independent controls: a mode toggle (light / dark) and the
 * accent grid. Either applies + persists immediately. No save button:
 * each change is a single attribute swap on <html>, there's nothing
 * to roll back.
 *
 * Persistence: localStorage only (device-scoped). The boot script in
 * layout.tsx replays both choices before first paint on subsequent
 * loads.
 */
export function AppearancePanel() {
  const { theme, setTheme, mode, setMode } = useTheme();
  const { account, accountId, accountRole, refreshProfile } = useAuth();
  const [logoUrl, setLogoUrl] = useState("");
  const [savingLogo, setSavingLogo] = useState(false);

  useEffect(() => {
    if (account?.logo_url) {
      setLogoUrl(account.logo_url);
    } else {
      setLogoUrl("");
    }
  }, [account]);

  const handleSaveLogo = async () => {
    if (!accountId) return;
    setSavingLogo(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("accounts")
        .update({ logo_url: logoUrl.trim() || null })
        .eq("id", accountId);

      if (error) throw error;

      toast.success("Logotipo atualizado!");
      await refreshProfile();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar logotipo");
    } finally {
      setSavingLogo(false);
    }
  };

  const isAllowedToEdit = accountRole === "owner" || accountRole === "admin";

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Aparência"
        description="Defina o tema, cor de destaque e logotipo da sua conta."
      />

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SunMoon className="size-4 text-muted-foreground" />
          Modo
        </h3>

        <div
          role="radiogroup"
          aria-label="Modo de cor"
          className="grid max-w-md grid-cols-2 gap-3"
        >
          {MODES.map((m) => (
            <ModeCard
              key={m}
              mode={m}
              isActive={m === mode}
              onPick={() => setMode(m)}
            />
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Palette className="size-4 text-muted-foreground" />
          Cor de destaque
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((t) => (
            <ThemeCard
              key={t.id}
              id={t.id}
              name={t.name}
              tagline={t.tagline}
              swatch={t.swatch}
              isActive={t.id === theme}
              onPick={() => setTheme(t.id)}
            />
          ))}
        </div>
      </div>

      {isAllowedToEdit && (
        <div className="mt-8 border-t border-border pt-8 space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Image className="size-4 text-muted-foreground" />
            Logotipo do CRM
          </h3>
          <p className="text-xs text-muted-foreground">
            Insira a URL de uma imagem para substituir o logotipo padrão do DDM CRM no menu lateral.
          </p>
          <div className="flex max-w-md items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="crm-logo-url" className="sr-only">URL do Logotipo</Label>
              <Input
                id="crm-logo-url"
                placeholder="https://exemplo.com/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </div>
            <Button onClick={handleSaveLogo} disabled={savingLogo}>
              {savingLogo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Logo
            </Button>
          </div>
          {logoUrl && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border p-3 bg-muted/40 max-w-md">
              <span className="text-xs text-muted-foreground">Pré-visualização:</span>
              <img
                src={logoUrl}
                alt="Preview do Logo"
                className="h-8 max-w-[120px] object-contain rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ModeCard({
  mode,
  isActive,
  onPick,
}: {
  mode: Mode;
  isActive: boolean;
  onPick: () => void;
}) {
  const isLight = mode === "light";
  const Icon = isLight ? Sun : Moon;
  return (
    <button
      type="button"
      role="radio"
      onClick={onPick}
      aria-checked={isActive}
      aria-label={`Use ${mode} mode`}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-semibold capitalize text-foreground">
        {mode}
      </span>
      {isActive && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
          <Check className="h-3 w-3" />
          Active
        </span>
      )}
    </button>
  );
}

function ThemeCard({
  id,
  name,
  tagline,
  swatch,
  isActive,
  onPick,
}: {
  id: ThemeId;
  name: string;
  tagline: string;
  swatch: string;
  isActive: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isActive}
      aria-label={`Use ${name} theme`}
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        isActive
          ? "border-primary/60 ring-2 ring-primary/40"
          : "border-border hover:border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full"
          style={{
            background: swatch,
            boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.15)",
          }}
        />
        {isActive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Check className="h-3 w-3" />
            Active
          </span>
        )}
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{name}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {tagline}
        </div>
      </div>
      <div
        className="mt-1 flex h-2 overflow-hidden rounded-full"
        aria-hidden
      >
        <span className="flex-1" style={{ background: swatch }} />
        <span className="w-3 bg-muted-foreground/60" />
        <span className="w-3 bg-muted" />
        <span className="w-3 bg-card" />
      </div>
      <span className="sr-only">Theme id: {id}</span>
    </button>
  );
}
