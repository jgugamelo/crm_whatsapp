export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  items: string[];
}

export const CURRENT_CHANGELOG: ChangelogEntry = {
  version: "0.3.1",
  date: "16/07/2026",
  title: "Customização de Marca e Identidade do CRM 🎨",
  description: "Nesta atualização, adicionamos a possibilidade de personalizar a identidade do seu CRM, incluindo o nome e o logotipo corporativo diretamente nas configurações.",
  items: [
    "Possibilidade de personalizar o Nome do CRM/Workspace diretamente no painel de controle.",
    "Suporte para upload e remoção de logotipos corporativos customizados.",
    "Atualização em tempo real do nome e logo no menu lateral e cabeçalho do sistema.",
    "Integração oficial com WAHA (WhatsApp HTTP API) para conexões diretas do WhatsApp Web."
  ]
};
