'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
  QrCode,
  RefreshCw,
  Server,
  Settings,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SettingsPanelHead } from './settings-panel-head';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const supabase = createClient();
  const { user, accountId, loading: authLoading, profileLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Provider selection: 'meta' | 'waha'
  const [provider, setProvider] = useState<'meta' | 'waha'>('meta');

  // Meta States
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  // WAHA States
  const [wahaUrl, setWahaUrl] = useState('');
  const [wahaSession, setWahaSession] = useState('');
  const [wahaApiKey, setWahaApiKey] = useState('');
  const [wahaApiKeyEdited, setWahaApiKeyEdited] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string>('STOPPED');
  const [qrTrigger, setQrTrigger] = useState(0);
  const [wahaConnecting, setWahaConnecting] = useState(false);

  // VoIP States
  const [voipBaseUrl, setVoipBaseUrl] = useState<string>('');
  const [voipStatus, setVoipStatus] = useState<string>('NOT_CREATED');
  const [voipQr, setVoipQr] = useState<string>('');
  const [voipLoading, setVoipLoading] = useState(false);

  // Meta specific checks
  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;
  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  type RegistrationProbe = {
    live: boolean;
    checks: Record<string, boolean | null>;
    errors?: string[];
    last_registration_error?: string | null;
    registered_at?: string | null;
    subscribed_apps_at?: string | null;
  };
  const [registrationProbe, setRegistrationProbe] =
    useState<RegistrationProbe | null>(null);

  const metaWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const wahaWebhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook/waha`
      : '';

  const checkWahaStatus = useCallback(async () => {
    if (!accountId) return;
    try {
      const res = await fetch('/api/whatsapp/config');
      const data = await res.json();
      if (data.provider === 'waha') {
        setSessionStatus(data.session_status || 'STOPPED');
        if (data.connected) {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('disconnected');
        }
      }
    } catch (err) {
      console.error('Failed to query WAHA status:', err);
    }
  }, [accountId]);

  const fetchConfig = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', acctId)
        .maybeSingle();

      if (error) {
        console.error('Failed to load config row:', error);
      }

      if (data) {
        setConfig(data);
        const currentProvider = data.provider || 'meta';
        setProvider(currentProvider);

        if (currentProvider === 'meta') {
          setPhoneNumberId(data.phone_number_id || '');
          setWabaId(data.waba_id || '');
          setAccessToken(MASKED_TOKEN);
          setVerifyToken('');
          setPin('');
          setTokenEdited(false);
        } else {
          setWahaUrl(data.waha_url || '');
          setWahaSession(data.waha_session || '');
          setWahaApiKey(data.waha_api_key ? MASKED_TOKEN : '');
          setWahaApiKeyEdited(false);
          setSessionStatus(data.status || 'STOPPED');
        }
      } else {
        setConfig(null);
        setProvider('meta');
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken('');
        setPin('');
        setTokenEdited(false);

        setWahaUrl('');
        setWahaSession('');
        setWahaApiKey('');
        setWahaApiKeyEdited(false);
        setSessionStatus('STOPPED');
      }

      setRegistrationProbe(null);

      // Verify health/connection status
      if (data) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();

          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
            if (payload.provider === 'waha') {
              setSessionStatus(payload.session_status || 'WORKING');
            }
          } else {
            setConnectionStatus('disconnected');
            if (payload.provider === 'waha') {
              setSessionStatus(payload.session_status || 'STOPPED');
              setStatusMessage(payload.message || '');
            } else {
              setResetReason(payload.needs_reset ? 'token_corrupted' : payload.reason === 'meta_api_error' ? 'meta_api_error' : null);
              setStatusMessage(payload.message || '');
            }
          }
        } catch (err) {
          console.error('Health check failed:', err);
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Failed to load WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Hook for polling WAHA session status when needed
  useEffect(() => {
    if (provider !== 'waha' || !accountId) return;

    checkWahaStatus();

    const interval = setInterval(() => {
      checkWahaStatus();
      if (sessionStatus === 'SCAN_QR' || sessionStatus === 'STARTING') {
        setQrTrigger((prev) => prev + 1);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [provider, accountId, sessionStatus, checkWahaStatus]);

  const hasFetchedConfigRef = useRef(false);
  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      setLoading(false);
      return;
    }
    if (!hasFetchedConfigRef.current) {
      hasFetchedConfigRef.current = true;
      fetchConfig(accountId);
    }
  }, [authLoading, profileLoading, user, accountId, fetchConfig]);

  // Fetch VoIP Base URL Config
  useEffect(() => {
    fetch('/api/whatsapp/voip-url')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.url) {
          setVoipBaseUrl(data.url);
        }
      })
      .catch((err) => console.warn("Failed to fetch VoIP URL:", err));
  }, []);

  // VoIP Live Status and Pairing Event Listener (Direct CORS Call)
  useEffect(() => {
    if (provider !== 'waha' || !wahaSession || !voipBaseUrl) return;

    let active = true;
    let es: EventSource | null = null;

    const checkVoipSession = async () => {
      try {
        const res = await fetch(`${voipBaseUrl}/api/sessions`);
        if (!res.ok) return;
        const data = await res.json();
        const existing = data.sessions?.find((s: any) => s.id === wahaSession);
        if (existing) {
          if (active) {
            setVoipStatus(existing.state);
            if (existing.qr) setVoipQr(existing.qr);
          }
        } else {
          if (active) setVoipStatus('NOT_CREATED');
        }
      } catch (err) {
        console.warn("Failed to fetch VoIP sessions:", err);
      }
    };

    checkVoipSession();

    // Check status every 5 seconds
    const interval = setInterval(checkVoipSession, 5000);

    // Live Event Stream for QR and Auth status (Direct CORS SSE)
    try {
      const clientId = 'config-' + Math.random().toString(36).substring(2);
      es = new EventSource(`${voipBaseUrl}/api/events?clientId=${encodeURIComponent(clientId)}`);
      es.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data);
          if (event.sessionId !== wahaSession) return;

          if (event.type === 'auth-state') {
            if (active) {
              setVoipStatus(event.state);
              if (event.qr) setVoipQr(event.qr);
            }
          } else if (event.type === 'session-qr') {
            if (active) {
              setVoipStatus('SCAN_QR');
              setVoipQr(event.qr);
            }
          }
        } catch {}
      };
    } catch {}

    return () => {
      active = false;
      clearInterval(interval);
      es?.close();
    };
  }, [provider, wahaSession, voipBaseUrl]);

  const handleCreateVoipSession = async () => {
    if (!wahaSession || !voipBaseUrl) return;
    setVoipLoading(true);
    try {
      // 1. Create session
      await fetch(`${voipBaseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wahaSession }),
      });

      // 2. Trigger pair to output QR
      const pairRes = await fetch(`${voipBaseUrl}/api/sessions/${wahaSession}/pair`, {
        method: 'POST',
      });

      if (!pairRes.ok) throw new Error('Falha ao acionar pareamento');

      setVoipStatus('SCAN_QR');
      toast.success('Sessão de VoIP criada. Aguardando pareamento...');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao inicializar ligações');
    } finally {
      setVoipLoading(false);
    }
  };

  // WAHA session actions
  async function handleWahaStart() {
    setWahaConnecting(true);
    try {
      const res = await fetch('/api/whatsapp/waha/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start session');
      toast.success('WAHA session start requested.');
      await checkWahaStatus();
    } catch (err: any) {
      toast.error(err.message || 'Failed to start session');
    } finally {
      setWahaConnecting(false);
    }
  }

  async function handleWahaStop() {
    setWahaConnecting(true);
    try {
      const res = await fetch('/api/whatsapp/waha/stop', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to stop session');
      toast.success('WAHA session stop requested.');
      await checkWahaStatus();
    } catch (err: any) {
      toast.error(err.message || 'Failed to stop session');
    } finally {
      setWahaConnecting(false);
    }
  }

  async function handleSave() {
    if (provider === 'waha') {
      if (!wahaUrl.trim()) {
        toast.error('WAHA Server URL is required');
        return;
      }
      if (!wahaSession.trim()) {
        toast.error('WAHA Session Name is required');
        return;
      }

      setSaving(true);
      try {
        const payload: Record<string, any> = {
          provider: 'waha',
          waha_url: wahaUrl.trim(),
          waha_session: wahaSession.trim(),
          waha_api_key: wahaApiKeyEdited ? wahaApiKey.trim() : MASKED_TOKEN,
        };

        const res = await fetch('/api/whatsapp/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to save configuration');
        }

        toast.success(data.message || 'WAHA configuration saved.');
        if (accountId) fetchConfig(accountId);
      } catch (err: any) {
        console.error('Save WAHA config error:', err);
        toast.error(err.message || 'Failed to save WAHA configuration');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Original Meta save path
    if (!phoneNumberId.trim()) {
      toast.error('Phone Number ID is required');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('Access Token is required for initial setup');
      return;
    }

    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        provider: 'meta',
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        toast.error('Please re-enter the Access Token to save changes');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save configuration');
      }

      toast.success('WhatsApp API Configuration saved successfully!');
      if (accountId) fetchConfig(accountId);
    } catch (err: any) {
      console.error('Save config error:', err);
      toast.error(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        toast.success(
          provider === 'waha'
            ? 'Successfully connected to WAHA session!'
            : 'Successfully connected to Meta Cloud API!'
        );
      } else {
        setConnectionStatus('disconnected');
        toast.error(payload.message || 'Failed to connect. Check credentials.');
      }
    } catch (err: any) {
      console.error('Test connection failed:', err);
      toast.error(err.message || 'Failed to test connection');
    } finally {
      setTesting(false);
    }
  }

  async function handleReset() {
    if (!confirm('Are you sure you want to clear your saved WhatsApp configuration?')) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || 'Failed to delete configuration');
      }

      toast.success('Configuration reset successfully');
      if (accountId) fetchConfig(accountId);
    } catch (err: any) {
      console.error('Reset config error:', err);
      toast.error(err.message || 'Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  }

  // Meta specific function
  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    try {
      const res = await fetch('/api/whatsapp/config/register', { method: 'GET' });
      const payload = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(payload);

      if (payload.live) {
        toast.success('Registration is active and listening for webhooks.');
      } else {
        toast.error('Registration checks failed. See status block for details.');
      }
    } catch (err) {
      console.error('Failed to probe registration status:', err);
      toast.error('Failed to query registration status');
    } finally {
      setVerifyingRegistration(false);
    }
  }

  function handleCopyWebhookUrl() {
    const url = provider === 'waha' ? wahaWebhookUrl : metaWebhookUrl;
    navigator.clipboard.writeText(url);
    toast.success('Webhook URL copied to clipboard');
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="WhatsApp connection"
          description="Connect your WhatsApp account to the CRM via official Meta Cloud API or self-hosted WAHA (WhatsApp HTTP API)."
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="WhatsApp connection"
        description="Connect your WhatsApp account to the CRM via official Meta Cloud API or self-hosted WAHA (WhatsApp HTTP API)."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Main config form */}
        <div className="space-y-6">
          {/* Corrupted-token reset banner (Meta only) */}
          {provider === 'meta' && showResetBanner && (
            <Alert className="bg-amber-950/40 border-amber-600/40">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <AlertTitle className="text-amber-200 mb-1">
                    Stored token can&apos;t be decrypted
                  </AlertTitle>
                  <AlertDescription className="text-amber-100/80 text-sm">
                    {statusMessage}
                  </AlertDescription>
                  <Button
                    onClick={handleReset}
                    disabled={resetting}
                    size="sm"
                    className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {resetting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-4" />
                        Reset Configuration
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Alert>
          )}

          {/* Provider Selection Card */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Connection Provider</CardTitle>
              <CardDescription className="text-muted-foreground font-light">
                Choose whether you want to connect via Meta Cloud API or self-hosted WAHA.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant={provider === 'meta' ? 'default' : 'outline'}
                  onClick={() => setProvider('meta')}
                  className="flex-1 flex gap-2 items-center"
                >
                  <Settings className="size-4" />
                  Meta Cloud API
                </Button>
                <Button
                  type="button"
                  variant={provider === 'waha' ? 'default' : 'outline'}
                  onClick={() => setProvider('waha')}
                  className="flex-1 flex gap-2 items-center"
                >
                  <Server className="size-4" />
                  WAHA (WhatsApp Web)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Connection Status & QR Code (WAHA Specific) */}
          {provider === 'waha' && config && (
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  Session Control
                </CardTitle>
                <CardDescription className="text-muted-foreground font-light">
                  Manage your WAHA connection and QR Code scanning.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between border border-border rounded-lg p-3 bg-muted/40">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        sessionStatus === 'WORKING' ? 'bg-emerald-400' :
                        sessionStatus === 'SCAN_QR' ? 'bg-amber-400' :
                        sessionStatus === 'STARTING' ? 'bg-blue-400' : 'bg-red-400'
                      }`}></span>
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${
                        sessionStatus === 'WORKING' ? 'bg-emerald-500' :
                        sessionStatus === 'SCAN_QR' ? 'bg-amber-500' :
                        sessionStatus === 'STARTING' ? 'bg-blue-500' : 'bg-red-500'
                      }`}></span>
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">WAHA Status</h4>
                      <p className="text-xs text-muted-foreground">{sessionStatus}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={checkWahaStatus}
                      className="border-border hover:bg-muted text-muted-foreground"
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                    {sessionStatus === 'STOPPED' || sessionStatus === 'FAILED' ? (
                      <Button
                        size="sm"
                        onClick={handleWahaStart}
                        disabled={wahaConnecting}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {wahaConnecting ? 'Starting...' : 'Connect'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleWahaStop}
                        disabled={wahaConnecting}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        {wahaConnecting ? 'Stopping...' : 'Disconnect'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* QR Code Container */}
                {sessionStatus === 'SCAN_QR' && (
                  <div className="flex flex-col items-center justify-center p-6 border border-amber-600/30 bg-amber-950/10 rounded-lg space-y-3">
                    <div className="bg-white p-3 rounded-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/whatsapp/waha/qr?t=${qrTrigger}`}
                        alt="WhatsApp WAHA QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                    <div className="text-center">
                      <h5 className="text-sm font-semibold text-amber-200">Scan QR Code</h5>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                        Scan this QR code using WhatsApp on your phone (Linked Devices &gt; Link a Device) to authorize the session.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Connection Status & QR Code (VoIP calling) */}
          {provider === 'waha' && config && (
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  Ligações de Voz (WhatsApp VoIP)
                </CardTitle>
                <CardDescription className="text-muted-foreground font-light">
                  Gerencie as ligações de voz integradas por WebRTC.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between border border-border rounded-lg p-3 bg-muted/40">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${
                        voipStatus === 'working' ? 'bg-emerald-500 animate-pulse' :
                        voipStatus === 'SCAN_QR' ? 'bg-amber-500' : 'bg-red-500'
                      }`}></span>
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Status do VoIP</h4>
                      <p className="text-xs text-muted-foreground capitalize">
                        {voipStatus === 'working' ? 'Ativo e Conectado' : 
                         voipStatus === 'SCAN_QR' ? 'Aguardando QR Code' : 
                         voipStatus === 'NOT_CREATED' ? 'Desativado' : voipStatus}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {voipStatus === 'NOT_CREATED' && (
                      <Button
                        size="sm"
                        disabled={voipLoading || !wahaSession}
                        onClick={handleCreateVoipSession}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {voipLoading ? 'Ativando...' : 'Ativar Ligações'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* VoIP QR Code Container */}
                {voipStatus === 'SCAN_QR' && voipQr && (
                  <div className="flex flex-col items-center justify-center p-6 border border-amber-600/30 bg-amber-950/10 rounded-lg space-y-3">
                    <div className="bg-white p-3 rounded-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(voipQr)}`}
                        alt="WhatsApp VoIP QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                    <div className="text-center">
                      <h5 className="text-sm font-semibold text-amber-200">Escanear QR Code de Ligações</h5>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                        Escaneie este QR code usando seu celular no WhatsApp (Aparelhos Conectados) para permitir ligações no CRM.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Connection Status (Meta Specific) */}
          {provider === 'meta' && (
            <Alert className="bg-card border-border">
              <div className="flex items-center gap-2">
                {connectionStatus === 'connected' ? (
                  <CheckCircle2 className="size-4 text-primary" />
                ) : (
                  <XCircle className="size-4 text-red-500" />
                )}
                <AlertTitle className="text-foreground mb-0">
                  {connectionStatus === 'connected' ? 'Credentials valid' : 'Not Connected'}
                </AlertTitle>
              </div>
              <AlertDescription className="text-muted-foreground mt-1.5">
                {connectionStatus === 'connected'
                  ? 'Your access token authenticates with Meta. See Registration status below for whether webhooks are actually wired.'
                  : statusMessage ||
                    'Configure your Meta API credentials below to connect your WhatsApp Business account.'}
              </AlertDescription>
            </Alert>
          )}

          {/* Registration Status (Meta Specific) */}
          {provider === 'meta' && config && (
            <Alert
              className={
                isRegistered
                  ? 'bg-emerald-950/30 border-emerald-700/50'
                  : 'bg-amber-950/30 border-amber-700/50'
              }
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {isRegistered ? (
                    <CheckCircle2 className="size-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-400" />
                  )}
                  <AlertTitle
                    className={
                      'mb-0 ' + (isRegistered ? 'text-emerald-200' : 'text-amber-200')
                    }
                  >
                    {isRegistered
                      ? 'Registered — Meta will deliver events to wacrm'
                      : 'Not registered — Meta will not deliver events'}
                  </AlertTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVerifyRegistration}
                  disabled={verifyingRegistration}
                  className="border-border bg-transparent text-foreground hover:bg-muted h-7"
                >
                  {verifyingRegistration ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Zap className="size-3.5" />
                  )}
                  Verify with Meta
                </Button>
              </div>
              <AlertDescription className="text-muted-foreground mt-2 text-xs leading-relaxed">
                {isRegistered ? (
                  <>
                    Subscribed since{' '}
                    {config.registered_at
                      ? new Date(config.registered_at).toLocaleString()
                      : 'unknown'}
                    . Click <strong>Verify with Meta</strong> if events
                    stop arriving.
                  </>
                ) : lastRegistrationError ? (
                  <>
                    Last attempt failed with:{' '}
                    <span className="text-red-300">
                      {lastRegistrationError}
                    </span>
                    .
                  </>
                ) : (
                  'Verification pending.'
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Credentials Card (Based on Provider) */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">
                {provider === 'waha' ? 'WAHA Server Settings' : 'Meta API Credentials'}
              </CardTitle>
              <CardDescription className="text-muted-foreground font-light">
                {provider === 'waha'
                  ? 'Provide your self-hosted WhatsApp HTTP API server details.'
                  : 'Enter your Meta WhatsApp Business API credentials.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {provider === 'waha' ? (
                <>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">WAHA Server URL</Label>
                    <Input
                      placeholder="e.g. http://localhost:3000 or https://waha.myfirm.com"
                      value={wahaUrl}
                      onChange={(e) => setWahaUrl(e.target.value)}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      The public/local HTTP URL where your WAHA container is hosted.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Session Name</Label>
                    <Input
                      placeholder="e.g. default"
                      value={wahaSession}
                      onChange={(e) => setWahaSession(e.target.value)}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      A unique identifier for your WhatsApp connection session.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">WAHA API Key (Secret Key)</Label>
                    <div className="relative">
                      <Input
                        type={showToken ? 'text' : 'password'}
                        placeholder="Enter API Secret Token (optional)"
                        value={wahaApiKey}
                        onChange={(e) => {
                          setWahaApiKey(e.target.value);
                          setWahaApiKeyEdited(true);
                        }}
                        onFocus={() => {
                          if (wahaApiKey === MASKED_TOKEN) {
                            setWahaApiKey('');
                            setWahaApiKeyEdited(true);
                          }
                        }}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {config && !wahaApiKeyEdited && config.waha_api_key && (
                      <p className="text-xs text-muted-foreground">
                        API key is masked for security. Re-enter it to update.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Phone Number ID</Label>
                    <Input
                      placeholder="e.g. 100234567890123"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">WhatsApp Business Account ID</Label>
                    <Input
                      placeholder="e.g. 100234567890456"
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Permanent Access Token</Label>
                    <div className="relative">
                      <Input
                        type={showToken ? 'text' : 'password'}
                        placeholder="Enter your access token"
                        value={accessToken}
                        onChange={(e) => {
                          setAccessToken(e.target.value);
                          setTokenEdited(true);
                        }}
                        onFocus={() => {
                          if (accessToken === MASKED_TOKEN) {
                            setAccessToken('');
                            setTokenEdited(true);
                          }
                        }}
                        className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {config && !tokenEdited && (
                      <p className="text-xs text-muted-foreground">
                        Token is hidden for security. Re-enter it to update configuration.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Webhook Verify Token</Label>
                    <Input
                      placeholder="Create a custom verify token"
                      value={verifyToken}
                      onChange={(e) => setVerifyToken(e.target.value)}
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      A custom string you create. Must match the token you set in Meta webhook settings.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      Two-step verification PIN
                      <span className="ml-1 text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit PIN from Meta WhatsApp Manager"
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground tracking-widest"
                    />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Needed only to wire <strong className="text-muted-foreground">inbound</strong> messages
                      for a <strong className="text-muted-foreground">production</strong> number.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Webhook Configuration Card */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground">Webhook Configuration</CardTitle>
              <CardDescription className="text-muted-foreground font-light">
                {provider === 'waha'
                  ? 'Configure this URL in your WAHA settings to receive incoming chats.'
                  : 'Use this URL as your webhook callback in the Meta App Dashboard.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Webhook Callback URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={provider === 'waha' ? wahaWebhookUrl : metaWebhookUrl}
                    className="bg-muted border-border text-muted-foreground font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyWebhookUrl}
                    className="shrink-0 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !config}
              className="border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              {testing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Zap className="size-4" />
                  Test API Connection
                </>
              )}
            </Button>
            {config && (
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={resetting}
                className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
              >
                {resetting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" />
                    Reset Configuration
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Setup Instructions Sidebar */}
        <div>
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Setup Instructions</CardTitle>
              <CardDescription className="text-muted-foreground font-light">
                {provider === 'waha'
                  ? 'Follow these steps to connect your WhatsApp account via WAHA.'
                  : 'Follow these steps to connect your WhatsApp Business API.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {provider === 'waha' ? (
                <Accordion>
                  <AccordionItem className="border-border">
                    <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                      <span className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                        Run WAHA Container
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                      <p className="mb-2">Run the WAHA docker container on your server or locally:</p>
                      <pre className="bg-muted p-2 rounded text-xs overflow-x-auto text-foreground font-mono">
                        docker run -d \<br />
                        &nbsp;&nbsp;-p 3000:3000 \<br />
                        &nbsp;&nbsp;devlikeapro/waha
                      </pre>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem className="border-border">
                    <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                      <span className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                        Configure Server Details
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-sm">
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Enter your server URL (ex: <code className="text-foreground font-mono">http://localhost:3000</code>)</li>
                        <li>Set a unique session name (ex: <code className="text-foreground font-mono">default</code>)</li>
                        <li>Provide API secret token if configured</li>
                        <li>Click <strong>Save Configuration</strong></li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem className="border-border">
                    <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                      <span className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                        Link WhatsApp Account
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-sm">
                      <ol className="list-decimal list-inside space-y-1">
                        <li>In the <strong>Session Control</strong> panel, click <strong>Connect</strong></li>
                        <li>Scan the QR code with WhatsApp on your phone</li>
                        <li>Wait for status to show as <strong className="text-emerald-400">WORKING</strong></li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem className="border-border">
                    <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                      <span className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                        Setup Webhooks
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground text-sm">
                      <p className="mb-2">In the WAHA dashboard or API, configure a webhook pointing to the CRM URL:</p>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li>Events: <code className="text-foreground">message</code>, <code className="text-foreground">message.status</code></li>
                        <li>URL: Copy callback URL from settings</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : (
                <Accordion>
                  <AccordionItem className="border-border">
                    <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                      <span className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                        Create a Meta App
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        <li>Go to <span className="text-primary">developers.facebook.com</span></li>
                        <li>Click &quot;My Apps&quot; and then &quot;Create App&quot;</li>
                        <li>Select &quot;Business&quot; as the app type</li>
                        <li>Fill in app details and create</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem className="border-border">
                    <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                      <span className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                        Add WhatsApp Product
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        <li>In your app dashboard, click &quot;Add Product&quot;</li>
                        <li>Find &quot;WhatsApp&quot; and click &quot;Set Up&quot;</li>
                        <li>Follow the setup wizard to link your business</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem className="border-border">
                    <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                      <span className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
                        Get API Credentials
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        <li>Go to WhatsApp &gt; API Setup</li>
                        <li>Copy your <strong className="text-foreground">Phone Number ID</strong></li>
                        <li>Copy your <strong className="text-foreground">WhatsApp Business Account ID</strong></li>
                        <li>Generate a <strong className="text-foreground">Permanent Access Token</strong> from Business Settings &gt; System Users</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem className="border-border">
                    <AccordionTrigger className="text-muted-foreground hover:text-foreground hover:no-underline">
                      <span className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
                        Configure Webhooks
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        <li>Go to WhatsApp &gt; Configuration</li>
                        <li>Click &quot;Edit&quot; on the Webhook section</li>
                        <li>Paste the <strong className="text-foreground">Webhook Callback URL</strong> from above</li>
                        <li>Enter the same <strong className="text-foreground">Verify Token</strong> you set here</li>
                        <li>Subscribe to &quot;messages&quot; webhook field</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {provider === 'meta' && (
                <div className="mt-4 pt-4 border-t border-border">
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    <ExternalLink className="size-3.5" />
                    Meta WhatsApp API Documentation
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
