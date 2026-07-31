'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload, Trash2, Mail, CircleAlert, UserCheck } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

// Rough email shape check — the real validator is Supabase Auth, which
// rejects anything malformed when we call updateUser({ email }). We
// just want to stop obvious typos before making a network call.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ProfileForm() {
  const { user, profile, refreshProfile } = useAuth();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [includeAgentName, setIncludeAgentName] = useState(true);
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailChangePending, setEmailChangePending] = useState(false);

  // Seed form state once the profile or user loads.
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setEmail(profile.email ?? user?.email ?? '');
      const metaSetting = user?.user_metadata?.include_agent_name;
      setIncludeAgentName(profile.include_agent_name !== false && metaSetting !== false);
    } else if (user) {
      setEmail(user.email ?? '');
      setFullName((user.user_metadata?.full_name as string) ?? '');
      setIncludeAgentName(user.user_metadata?.include_agent_name !== false);
    }
  }, [profile, user]);

  // Cleanup object URLs to avoid leaks.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentAvatar =
    previewUrl ?? (!removeAvatar ? profile?.avatar_url ?? null : null);

  const initial = (fullName || profile?.full_name || profile?.email || 'U')
    .charAt(0)
    .toUpperCase();

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-picked
    if (!file) return;

    if (!ALLOWED_MIME.has(file.type)) {
      toast.error('Unsupported image type', {
        description: 'Use PNG, JPG, WebP, or GIF.',
      });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Image is too large', {
        description: 'Maximum 2 MB.',
      });
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingAvatar(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRemoveAvatar(false);
  };

  const onRemoveAvatar = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingAvatar(null);
    setPreviewUrl(null);
    setRemoveAvatar(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error('Display name is required');
      return;
    }
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      toast.error('Enter a valid email address');
      return;
    }

    setSaving(true);
    try {
      let nextAvatarUrl: string | null = profile.avatar_url ?? null;

      // Upload a newly-staged image, if any.
      if (pendingAvatar) {
        const ext =
          pendingAvatar.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, pendingAvatar, {
            cacheControl: '3600',
            upsert: true,
            contentType: pendingAvatar.type,
          });
        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }
        const {
          data: { publicUrl },
        } = supabase.storage.from('avatars').getPublicUrl(path);
        nextAvatarUrl = publicUrl;
      } else if (removeAvatar) {
        nextAvatarUrl = null;
      }

      // Persist name + avatar + agent signature setting via /api/account/profile.
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: trimmedName,
          avatar_url: nextAvatarUrl,
          include_agent_name: includeAgentName,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro ao salvar perfil');
      }

      // Email change goes through Supabase Auth, which emails a
      // confirmation to both the old and new addresses. We don't
      // touch profiles.email — Supabase will push the change there
      // after the user clicks the link (handled by the handle_new_user
      // trigger pattern in production deployments).
      let emailSent = false;
      if (trimmedEmail.toLowerCase() !== profile.email.toLowerCase()) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: trimmedEmail,
        });
        if (emailError) {
          // Partial success: name/avatar saved but email didn't.
          toast.success('Profile saved');
          toast.error(`Email change failed: ${emailError.message}`);
          setSaving(false);
          await refreshProfile();
          return;
        }
        emailSent = true;
      }

      setEmailChangePending(emailSent);
      setPendingAvatar(null);
      setPreviewUrl(null);
      setRemoveAvatar(false);
      await refreshProfile();

      toast.success(
        emailSent
          ? 'Profile saved — check your email to confirm the address change'
          : 'Profile saved',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const initialInclude = profile?.include_agent_name !== false && user?.user_metadata?.include_agent_name !== false;
  const dirty =
    !!profile &&
    (fullName.trim() !== (profile.full_name ?? '') ||
      email.trim().toLowerCase() !== (profile.email ?? '').toLowerCase() ||
      includeAgentName !== initialInclude ||
      pendingAvatar !== null ||
      removeAvatar);

  const joined = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Seu perfil"
        description="Como você aparece no sistema. Sua foto e seu nome aparecem no cabeçalho, na barra lateral e para seus colegas de equipe."
      />
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-6 pt-6">
            {/* Avatar section */}
            <div className="flex items-center gap-4">
              <Avatar className="size-20 border border-border">
                {currentAvatar ? (
                  <AvatarImage src={currentAvatar} alt={fullName || 'Avatar'} />
                ) : null}
                <AvatarFallback className="text-xl font-bold">
                  {initial}
                </AvatarFallback>
              </Avatar>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={onPickFile}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    {currentAvatar ? 'Alterar foto' : 'Enviar foto'}
                  </Button>

                  {currentAvatar && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={onRemoveAvatar}
                    >
                      <Trash2 className="size-4" />
                      Remover
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, WebP ou GIF até 2 MB.
                </p>
              </div>
            </div>

            {/* Form fields */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nome de exibição</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Endereço de e-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  required
                />
                {emailChangePending && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-500">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Enviamos um link de confirmação para{' '}
                      <strong>{email}</strong> para confirmar a alteração.
                    </span>
                  </p>
                )}
              </div>

              {/* Signature toggle section */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <Label htmlFor="agent_signature" className="text-sm font-semibold text-foreground cursor-pointer">
                      Identificar Atendente nas Mensagens (Assinatura)
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Adiciona automaticamente seu nome no início de cada mensagem enviada no WhatsApp no padrão:<br />
                    <span className="inline-block mt-1 font-mono text-[11px] font-medium text-primary bg-primary/10 px-2.5 py-1.5 rounded border border-primary/20 whitespace-pre-line">
                      {`*${fullName || 'Lucas Tulio'}:*\n\nUm momento por favor.`}
                    </span>
                  </p>
                </div>
                <Switch
                  id="agent_signature"
                  checked={includeAgentName}
                  onCheckedChange={setIncludeAgentName}
                />
              </div>
            </div>

            {/* Read-only block */}
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Detalhes da Conta
              </p>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Função / Cargo</dt>
                  <dd className="mt-0.5 font-mono text-foreground capitalize">
                    {profile?.account_role === 'owner'
                      ? 'Proprietário'
                      : profile?.account_role === 'admin'
                      ? 'Administrador'
                      : profile?.account_role === 'agent'
                      ? 'Consultor'
                      : profile?.account_role === 'viewer'
                      ? 'Visualizador'
                      : profile?.account_role ?? 'Membro'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Membro desde</dt>
                  <dd className="mt-0.5 text-foreground">{joined}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">ID do Usuário</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                    {user?.id ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Salvando…
              </>
            ) : (
              'Salvar alterações'
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}
