'use client';

// ============================================================
// /join/[token] — invitation redemption landing page.
//
// Four UI states driven by:
//   - the peek result (server-validated invite payload), and
//   - whether the visitor is currently authenticated.
//
//   ┌──────────────────────┬───────────────┬─────────────────────────┐
//   │ peek                 │ auth          │ render                   │
//   ├──────────────────────┼───────────────┼─────────────────────────┤
//   │ loading              │ —             │ spinner                  │
//   │ ok:false (any reason)│ —             │ friendly error + signup  │
//   │ ok:true              │ signed out    │ "Sign up" + "Sign in"    │
//   │ ok:true              │ signed in     │ "Accept" button → redeem │
//   └──────────────────────┴───────────────┴─────────────────────────┘
//
// We deliberately do NOT redeem automatically on page load — the
// invitee should confirm what account/role they're accepting.
// Auto-redeem would also race with the signup flow returning to
// this page after email verification.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  MailX,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';

interface PeekOk {
  ok: true;
  account_name: string;
  role: 'admin' | 'agent' | 'viewer';
  expires_at: string;
}
interface PeekFail {
  ok: false;
  reason: 'not_found' | 'used' | 'expired' | 'server_error';
}
type PeekResult = PeekOk | PeekFail;

const ROLE_LABEL: Record<PeekOk['role'], string> = {
  admin: 'Administrador',
  agent: 'Consultor',
  viewer: 'Visualizador',
};

const FAIL_COPY: Record<PeekFail['reason'], { title: string; body: string }> = {
  not_found: {
    title: 'Convite não encontrado',
    body: 'Este link não corresponde a um convite válido. Verifique a URL ou peça um novo convite à pessoa que convidou você.',
  },
  used: {
    title: 'Convite já utilizado',
    body: 'Este convite já foi aceito anteriormente. Se não foi você, solicite ao administrador da conta que envie um novo link.',
  },
  expired: {
    title: 'Convite expirado',
    body: 'Este convite expirou. Solicite ao administrador da conta que gere um novo convite.',
  },
  server_error: {
    title: 'Algo deu errado',
    body: 'Não foi possível verificar este convite no momento. Tente recarregar a página em alguns instantes.',
  },
};

export default function JoinPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [peek, setPeek] = useState<PeekResult | null>(null);
  const [authedUserId, setAuthedUserId] = useState<string | null | undefined>(
    undefined,
  );
  const [accepting, setAccepting] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const loadPeekAndAuth = useCallback(async () => {
    if (!token) return;
    setPeek(null);
    setAuthedUserId(undefined);
    try {
      const [peekRes, authRes] = await Promise.all([
        fetch(`/api/invitations/${encodeURIComponent(token)}/peek`, {
          cache: 'no-store',
        }),
        createClient().auth.getUser(),
      ]);
      const peekBody = (await peekRes.json()) as PeekResult;
      setPeek(peekBody);
      setAuthedUserId(authRes.data.user?.id ?? null);
    } catch (err) {
      console.error('[join] peek error:', err);
      setPeek({ ok: false, reason: 'server_error' });
    }
  }, [token]);

  useEffect(() => {
    loadPeekAndAuth();
  }, [loadPeekAndAuth]);

  const handleAccept = useCallback(async () => {
    if (!token) return;
    setAccepting(true);
    setConflictMessage(null);
    try {
      const res = await fetch(
        `/api/invitations/${encodeURIComponent(token)}/redeem`,
        { method: 'POST' },
      );
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (res.ok && data?.ok) {
        toast.success('Convite aceito com sucesso!');
        window.location.href = '/dashboard';
        return;
      }

      if (res.status === 409) {
        setConflictMessage(
          data?.error ||
            'Sua conta atual já possui dados ou pertence a outra equipe. Para aceitar este convite, crie uma nova conta com outro e-mail.',
        );
        setAccepting(false);
        return;
      }

      toast.error(data?.error || 'Não foi possível aceitar o convite.');
      setAccepting(false);
    } catch (err) {
      console.error('[join] redeem error:', err);
      toast.error('Não foi possível se conectar ao servidor.');
      setAccepting(false);
    }
  }, [token]);

  const handleSignOutAndRetry = useCallback(async () => {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
      window.location.reload();
    } catch (err) {
      console.error('[join] sign-out error:', err);
      toast.error('Não foi possível sair. Tente recarregar a página.');
      setSigningOut(false);
    }
  }, []);

  // ----- Loading state -----
  if (peek === null || authedUserId === undefined) {
    return (
      <Card className="w-full max-w-md border-border bg-card">
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verificando convite…</p>
        </CardContent>
      </Card>
    );
  }

  // ----- Peek failed -----
  if (!peek.ok) {
    const copy = FAIL_COPY[peek.reason];
    return (
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
            <MailX className="h-6 w-6 text-red-400" />
          </div>
          <CardTitle className="text-xl text-foreground">{copy.title}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {copy.body}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {peek.reason === 'server_error' ? (
            <>
              <Button
                onClick={loadPeekAndAuth}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Tentar novamente
              </Button>
              <Link href="/signup">
                <Button
                  variant="outline"
                  className="w-full border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Criar uma nova conta
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/signup">
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  Criar uma nova conta
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  variant="outline"
                  className="w-full border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Entrar em uma conta
                </Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // ----- Peek OK -----
  const inviteHeader = (
    <CardHeader className="items-center text-center">
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <UsersRound className="h-6 w-6 text-primary" />
      </div>
      <CardTitle className="text-xl text-foreground">
        Você foi convidado para{' '}
        <span className="text-primary">{peek.account_name}</span>
      </CardTitle>
      <CardDescription className="text-muted-foreground">
        Você entrará como{' '}
        <span className="inline-flex items-center gap-1 text-foreground font-medium">
          <ShieldCheck className="size-3.5 text-primary" />
          {ROLE_LABEL[peek.role]}
        </span>
        . Link válido até{' '}
        {new Date(peek.expires_at).toLocaleDateString('pt-BR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })}
        .
      </CardDescription>
    </CardHeader>
  );

  // ----- Authed: show Accept button -----
  if (authedUserId) {
    return (
      <>
        <Card className="w-full max-w-md border-border bg-card">
          {inviteHeader}
          <CardContent className="flex flex-col gap-3">
            <Button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {accepting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Aceitando…
                </>
              ) : (
                <>
                  <CheckCircle className="size-4" />
                  Aceitar convite
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Ao aceitar, seu perfil será vinculado à conta{' '}
              <span className="text-foreground font-medium">{peek.account_name}</span>.
            </p>
          </CardContent>
        </Card>

        <Dialog
          open={conflictMessage !== null}
          onOpenChange={(open) => {
            if (!open) setConflictMessage(null);
          }}
        >
          <DialogContent className="bg-popover border-border sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-popover-foreground">
                <AlertTriangle className="size-4 text-amber-400" />
                Não é possível aceitar o convite
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {conflictMessage}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2 text-xs text-muted-foreground">
              <p>
                Para entrar em{' '}
                <span className="text-popover-foreground">{peek.account_name}</span>,
                saia da conta atual e faça o cadastro com um novo endereço de e-mail.
              </p>
            </div>
            <DialogFooter className="bg-popover border-border">
              <Button
                variant="outline"
                onClick={() => setConflictMessage(null)}
                className="border-border text-popover-foreground hover:bg-muted"
              >
                Permanecer conectado
              </Button>
              <Button
                onClick={handleSignOutAndRetry}
                disabled={signingOut}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {signingOut ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saindo…
                  </>
                ) : (
                  'Sair e usar outro e-mail'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ----- Not authed -----
  return (
    <Card className="w-full max-w-md border-border bg-card">
      {inviteHeader}
      <CardContent className="flex flex-col gap-2">
        <Link href={`/signup?invite=${encodeURIComponent(token!)}`}>
          <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            Criar conta e entrar
          </Button>
        </Link>
        <Link href={`/login?invite=${encodeURIComponent(token!)}`}>
          <Button
            variant="outline"
            className="w-full border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            I already have an account
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
