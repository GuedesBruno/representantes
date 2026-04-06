import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Portal de Representantes | Tecassistiva',
    template: '%s | Tecassistiva',
  },
  description: 'Portal exclusivo para representantes e revendedores da Tecassistiva. Acesse projetos, oportunidades e inteligência de mercado.',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <a href="#main-content" className="skip-link">
          Ir para o conteúdo principal
        </a>
        {children}
      </body>
    </html>
  );
}
