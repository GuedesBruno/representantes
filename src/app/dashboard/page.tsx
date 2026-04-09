import Link from 'next/link';
import styles from './home.module.css';

const MENU_OPTIONS = [
  {
    href: '/dashboard/folhetos',
    title: 'Folhetos',
    description: 'Materiais comerciais prontos para consulta e download.',
  },
  {
    href: '/dashboard/tabela-precos',
    title: 'Tabela de Preços',
    description: 'Acesse as tabelas atualizadas para cotações.',
  },
  {
    href: '/dashboard/videos',
    title: 'Vídeos',
    description: 'Demonstrações e apresentações dos produtos.',
  },
  {
    href: '/dashboard/produtos',
    title: 'Produtos',
    description: 'Catálogos, links e informações de cada produto.',
  },
  {
    href: '/dashboard/documentos',
    title: 'Documentos',
    description: 'Documentos institucionais e comerciais de apoio.',
  },
  {
    href: '/dashboard/projetos-modelos',
    title: 'Projetos',
    description: 'Monte kits e propostas com base nos modelos disponíveis.',
  },
  {
    href: '/dashboard/oportunidades',
    title: 'Oportunidades',
    description: 'Registre e acompanhe oportunidades da sua carteira.',
  },
  {
    href: '/dashboard/inteligencia',
    title: 'Inteligência',
    description: 'Acompanhe recursos analíticos e visão estratégica.',
  },
];

export default function DashboardIndexPage() {
  return (
    <section className={styles.page} aria-label="Escolha de menu">
      <header className={styles.header}>
        <h2 className={styles.title}>Escolha uma área para começar</h2>
        <p className={styles.subtitle}>
          Selecione uma opção abaixo para navegar pelo portal.
        </p>
      </header>

      <div className={styles.grid}>
        {MENU_OPTIONS.map((item) => (
          <Link key={item.href} href={item.href} className={styles.card}>
            <h3 className={styles.cardTitle}>{item.title}</h3>
            <p className={styles.cardText}>{item.description}</p>
            <span className={styles.cardAction}>Abrir</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
