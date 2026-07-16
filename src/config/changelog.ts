export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  items: string[];
}

export const CURRENT_CHANGELOG: ChangelogEntry = {
  version: "0.4.0",
  date: "16/07/2026",
  title: "Respostas Rápidas e Melhorias de Produtividade ⚡",
  description: "Adicionamos novos atalhos de produtividade, respostas automáticas no chat e indicadores visuais para tornar o atendimento da sua equipe ainda mais ágil.",
  items: [
    "Nova funcionalidade de Respostas Rápidas: Cadastre atalhos com '/' e gerencie respostas prontas no painel de configurações.",
    "Menu flutuante de autocompletar na caixa de chat que filtra atalhos conforme você digita.",
    "Navegação completa do autocomplete por teclado (teclas de direção para navegar, Enter/Tab para selecionar e Esc para fechar).",
    "Indicador visual de Rascunhos (Drafts) na lista lateral de chats para que você nunca esqueça de enviar uma mensagem digitada.",
    "Contagem de conversas não lidas diretamente no título da aba do navegador."
  ]
};
