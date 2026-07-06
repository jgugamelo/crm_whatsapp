import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/components/layout/QueryProvider';

export const metadata: Metadata = {
  title: 'DDM Disparador',
  description: 'Plataforma de disparo inteligente de mensagens via WhatsApp — Grupo DDM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
