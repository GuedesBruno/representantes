'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './dashboard.module.css';

const NAV_ITEMS = [
  {
    section: 'Materiais',
    items: [
      {
        href: '/dashboard/folhetos',
        label: 'Folhetos',
        icon: (
          <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 3h9l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M15 3v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        href: '/dashboard/tabela-precos',
        label: 'Tabela de Preços',
        icon: (
          <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2" />
            <line x1="9" y1="10" x2="9" y2="20" stroke="currentColor" strokeWidth="2" />
          </svg>
        ),
      },
      {
        href: '/dashboard/videos',
        label: 'Vídeos',
        icon: (
          <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
            <polygon points="10,9 10,15 15,12" fill="currentColor" />
            <path d="M17 10l4-2v8l-4-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        href: '/dashboard/produtos',
        label: 'Produtos',
        icon: (
          <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 7l9-4 9 4-9 4-9-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 7v10l9 4 9-4V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        href: '/dashboard/documentos',
        label: 'Documentos',
        icon: (
          <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="8" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        href: '/dashboard/projetos-modelos',
        label: 'Projetos',
        icon: (
          <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
    ],
  },
];

const ADMIN_NAV_ITEMS = [
  {
    href: '/dashboard/admin/produtos-modelos',
    label: 'Produtos Modelos',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 7l9-4 9 4-9 4-9-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 7v10l9 4 9-4V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="19" cy="19" r="3" fill="currentColor" />
        <path d="M19 17v2M19 21v0" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/admin/kits-modelos',
    label: 'Kits Modelos',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/dashboard/admin/usuarios',
    label: 'Usuários',
    icon: (
      <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Início',
  '/dashboard/folhetos': 'Folhetos',
  '/dashboard/tabela-precos': 'Tabela de Preços',
  '/dashboard/videos': 'Vídeos',
  '/dashboard/produtos': 'Produtos',
  '/dashboard/documentos': 'Documentos',
  '/dashboard/projetos': 'Projetos',
  '/dashboard/projetos-modelos': 'Projetos',
  '/dashboard/admin/produtos-modelos': 'Produtos Modelos (Admin)',
  '/dashboard/admin/kits-modelos': 'Kits Modelos (Admin)',
  '/dashboard/admin/usuarios': 'Usuários (Admin)',
};

const REORDERABLE_MATERIAL_HREFS = [
  '/dashboard/folhetos',
  '/dashboard/videos',
  '/dashboard/produtos',
  '/dashboard/documentos',
] as const;

const DEFAULT_MATERIAL_ORDER = [...REORDERABLE_MATERIAL_HREFS];

function normalizeMaterialOrder(rawOrder: unknown): string[] {
  if (!Array.isArray(rawOrder)) {
    return DEFAULT_MATERIAL_ORDER;
  }

  const unique = new Set<string>();
  for (const value of rawOrder) {
    const href = String(value ?? '').trim();
    if (REORDERABLE_MATERIAL_HREFS.includes(href as (typeof REORDERABLE_MATERIAL_HREFS)[number])) {
      unique.add(href);
    }
  }

  const normalized = [...unique];
  for (const href of DEFAULT_MATERIAL_ORDER) {
    if (!normalized.includes(href)) {
      normalized.push(href);
    }
  }

  return normalized;
}

function getOrderedMaterialItems<T extends { href: string }>(items: T[], materialOrder: string[]) {
  const normalizedOrder = normalizeMaterialOrder(materialOrder);
  const slotIndexes = items
    .map((item, index) => ({ href: item.href, index }))
    .filter(({ href }) => REORDERABLE_MATERIAL_HREFS.includes(href as (typeof REORDERABLE_MATERIAL_HREFS)[number]))
    .map(({ index }) => index);

  const orderedSubset = normalizedOrder
    .map((href) => items.find((item) => item.href === href))
    .filter(Boolean) as T[];

  const nextItems = [...items];
  slotIndexes.forEach((slotIndex, i) => {
    if (orderedSubset[i]) {
      nextItems[slotIndex] = orderedSubset[i];
    }
  });

  return nextItems;
}

function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, logout } = useAuth();
  const [materialOrder, setMaterialOrder] = useState<string[]>(DEFAULT_MATERIAL_ORDER);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const initials = user?.displayName
    ? user.displayName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0].toUpperCase() ?? 'R';

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'app_settings', 'navigation'),
      (snapshot) => {
        const rawOrder = snapshot.data()?.materialOrder;
        setMaterialOrder(normalizeMaterialOrder(rawOrder));
      },
      () => {
        setMaterialOrder(DEFAULT_MATERIAL_ORDER);
      }
    );

    return unsubscribe;
  }, []);

  return (
    <>
      <div className={styles.sidebarHeader}>
        <div className={styles.sidebarLogoIcon} aria-hidden="true">
          <Image src="/logo_teca.png" alt="Logo Tecassistiva" width={32} height={32} style={{ objectFit: 'contain' }} />
        </div>
        <div>
          <div className={styles.sidebarLogoText}>Tecassistiva</div>
          <div className={styles.sidebarSubtext}>Portal de Representantes</div>
        </div>
      </div>

      <nav id="dashboard-sidebar-nav" className={styles.sidebarNav} aria-label="Navegação principal">
        {NAV_ITEMS.map((section) => (
          <div key={section.section} className={styles.navSection}>
            <div className={styles.navSectionLabel} aria-hidden="true">
              {section.section}
            </div>
            {getOrderedMaterialItems(section.items, materialOrder).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${pathname.startsWith(item.href) ? styles.active : ''}`}
                aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
              >
                {item.icon}
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
        {isAdmin && (
          <div className={styles.navSection}>
            <div className={styles.navSectionLabel} aria-hidden="true">
              Admin
            </div>
            {ADMIN_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${pathname.startsWith(item.href) ? styles.active : ''}`}
                aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
              >
                {item.icon}
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.userCard} aria-label={`Usuário: ${user?.displayName ?? user?.email}`}>
          <div className={styles.userAvatar} aria-hidden="true">{initials}</div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{user?.displayName ?? 'Representante'}</div>
            <div className={styles.userEmail}>{user?.email}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className={styles.logoutButton}
          type="button"
          aria-label="Sair da conta"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>Sair</span>
        </button>
      </div>
    </>
  );
}

function UsuariosHeaderActions({ pathname }: { pathname: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const usersSearchValue = searchParams.get('q') ?? '';
  const isInviteOpen = searchParams.get('invite') === '1';

  const updateUsuariosQuery = (next: { q?: string; invite?: '1' | '' }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (next.q !== undefined) {
      const value = next.q.trim();
      if (value) {
        params.set('q', value);
      } else {
        params.delete('q');
      }
    }

    if (next.invite !== undefined) {
      if (next.invite === '1') {
        params.set('invite', '1');
      } else {
        params.delete('invite');
      }
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className={styles.headerActions}>
      <input
        type="search"
        className={styles.headerSearchInput}
        placeholder="Buscar por e-mail, nome, região…"
        value={usersSearchValue}
        onChange={(event) => updateUsuariosQuery({ q: event.target.value })}
      />
      <button
        type="button"
        className={styles.headerInviteButton}
        onClick={() => updateUsuariosQuery({ invite: isInviteOpen ? '' : '1' })}
      >
        {isInviteOpen ? 'Fechar convite' : 'Convidar usuário'}
      </button>
    </div>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isProjetosModelos = pathname === '/dashboard/projetos-modelos';
  const isAdminUsuarios = pathname === '/dashboard/admin/usuarios';
  const [mode, setModeState] = useState<'investimento' | 'estrutura'>('investimento');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const hasOpenedMobileMenuByDefault = useRef(false);
  const pageTitle = isProjetosModelos
    ? (mode === 'investimento' ? 'Selecione o Investimento' : 'Selecione a Estrutura')
    : (PAGE_TITLES[pathname] ?? 'Dashboard');

  useEffect(() => {
    if (!isProjetosModelos) return;
    const params = new URLSearchParams(window.location.search);
    setModeState(params.get('modo') === 'estrutura' ? 'estrutura' : 'investimento');
  }, [isProjetosModelos, pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (hasOpenedMobileMenuByDefault.current) return;
    if (pathname !== '/dashboard/folhetos') return;

    const isMobileViewport = window.matchMedia('(max-width: 960px)').matches;
    if (!isMobileViewport) {
      hasOpenedMobileMenuByDefault.current = true;
      return;
    }

    setMobileMenuOpen(true);
    hasOpenedMobileMenuByDefault.current = true;
  }, [pathname]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const setMode = (nextMode: 'investimento' | 'estrutura') => {
    setModeState(nextMode);
    router.replace(`/dashboard/projetos-modelos?modo=${nextMode}`);
  };

  return (
    <div className={styles.layout}>
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.open : ''}`} aria-label="Menu lateral">
        <SidebarContent />
      </aside>
      {mobileMenuOpen ? (
        <button
          type="button"
          className={styles.overlay}
          aria-label="Fechar menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <div className={styles.main}>
        <header className={`${styles.header} ${isProjetosModelos ? styles.headerWithMode : ''}`}>
          <button
            type="button"
            className={styles.mobileMenuButton}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="dashboard-sidebar-nav"
          >
            <span className={styles.mobileMenuIcon} aria-hidden="true">
              {mobileMenuOpen ? '✕' : '☰'}
            </span>
          </button>
          <h1 className={styles.headerTitle} id="page-title">{pageTitle}</h1>
          {isProjetosModelos && (
            <div className={styles.headerModeSwitch}>
              <button
                type="button"
                className={`${styles.headerModeBtn} ${mode === 'investimento' ? styles.headerModeBtnActive : ''}`}
                onClick={() => setMode('investimento')}
              >
                Investimento
              </button>
              <button
                type="button"
                className={`${styles.headerModeBtn} ${mode === 'estrutura' ? styles.headerModeBtnActive : ''}`}
                onClick={() => setMode('estrutura')}
              >
                Estrutura
              </button>
            </div>
          )}
          {isAdminUsuarios && !isProjetosModelos && (
            <Suspense fallback={null}>
              <UsuariosHeaderActions pathname={pathname} />
            </Suspense>
          )}
        </header>

        <main
          id="main-content"
          className={styles.content}
          aria-labelledby="page-title"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
