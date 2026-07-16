export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  items: string[];
}

export const CURRENT_CHANGELOG: ChangelogEntry = {
  version: "0.3.0",
  date: "16/07/2026",
  title: "Integração WAHA e Correções de Infraestrutura 🚀",
  description: "Nesta atualização, trouxemos a integração completa com o WAHA para conexões diretas do WhatsApp Web e diversas otimizações de banco de dados.",
  items: [
    "Integração oficial com WAHA (WhatsApp HTTP API) adicionada às configurações.",
    "Criptografia de segurança interna (ENCRYPTION_KEY) ativada para proteger suas chaves na VPS.",
    "Correções e otimizações de migração aplicadas no banco de dados.",
    "Suporte para upload de logos empresariais customizados.",
    "Correção na detecção do status de sessões."
  ]
};
