'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './usuarios-admin.module.css';

type UserRole = 'admin' | 'representante';

interface UserDoc {
  id: string;
  uid: string;
  email: string;
  displayName?: string | null;
  role?: UserRole;
  isAdmin?: boolean;
  profile?: {
    nomeComercial?: string | null;
    telefone?: string | null;
    regiao?: string | null;
    avatarUrl?: string | null;
  };
  preferences?: {
    idioma?: string;
    moeda?: string;
    tema?: string;
    notificacoesEmail?: boolean;
    notificacoesPush?: boolean;
  };
  business?: {
    timeId?: string | null;
    carteiraIds?: string[];
    metas?: {
      mensal?: number | null;
      trimestral?: number | null;
      anual?: number | null;
    };
  };
}

const DEFAULT_EDITOR = {
  displayName: '',
  role: 'representante' as UserRole,
  nomeComercial: '',
  telefone: '',
  regiao: '',
  avatarUrl: '',
  idioma: 'pt-BR',
  moeda: 'BRL',
  tema: 'light',
  notificacoesEmail: true,
  notificacoesPush: false,
  timeId: '',
  carteiraIds: '',
  metaMensal: '',
  metaTrimestral: '',
  metaAnual: '',
};

export default function AdminUsuariosPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<UserDoc | null>(null);
  const [editor, setEditor] = useState(DEFAULT_EDITOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [loading, isAdmin, router]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserDoc, 'id'>) }));
        rows.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
        setUsers(rows);
        setLoadError('');
        setLoadingData(false);
      },
      () => {
        setLoadError('Não foi possível carregar usuários. Verifique permissões e regras do Firestore.');
        setLoadingData(false);
      }
    );

    return unsub;
  }, []);

  function openEditor(item: UserDoc) {
    setSelected(item);
    setError('');
    setSuccess('');
    setEditor({
      displayName: item.displayName ?? '',
      role: item.role ?? (item.isAdmin ? 'admin' : 'representante'),
      nomeComercial: item.profile?.nomeComercial ?? '',
      telefone: item.profile?.telefone ?? '',
      regiao: item.profile?.regiao ?? '',
      avatarUrl: item.profile?.avatarUrl ?? '',
      idioma: item.preferences?.idioma ?? 'pt-BR',
      moeda: item.preferences?.moeda ?? 'BRL',
      tema: item.preferences?.tema ?? 'light',
      notificacoesEmail: item.preferences?.notificacoesEmail ?? true,
      notificacoesPush: item.preferences?.notificacoesPush ?? false,
      timeId: item.business?.timeId ?? '',
      carteiraIds: (item.business?.carteiraIds ?? []).join(', '),
      metaMensal: item.business?.metas?.mensal?.toString() ?? '',
      metaTrimestral: item.business?.metas?.trimestral?.toString() ?? '',
      metaAnual: item.business?.metas?.anual?.toString() ?? '',
    });
  }

  function closeEditor() {
    setSelected(null);
    setError('');
    setSuccess('');
  }

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.toLowerCase();
    return users.filter((u) =>
      [u.email, u.displayName, u.profile?.nomeComercial, u.profile?.regiao]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [users, search]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!selected || !user) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const idToken = await user.getIdToken();

      const toNumberOrNull = (v: string) => {
        const n = Number(v);
        return Number.isFinite(n) && v.trim() !== '' ? n : null;
      };

      const payload = {
        targetUid: selected.uid,
        role: editor.role,
        displayName: editor.displayName || null,
        profile: {
          nomeComercial: editor.nomeComercial || null,
          telefone: editor.telefone || null,
          regiao: editor.regiao || null,
          avatarUrl: editor.avatarUrl || null,
        },
        preferences: {
          idioma: editor.idioma || 'pt-BR',
          moeda: editor.moeda || 'BRL',
          tema: editor.tema || 'light',
          notificacoesEmail: editor.notificacoesEmail,
          notificacoesPush: editor.notificacoesPush,
        },
        business: {
          timeId: editor.timeId || null,
          carteiraIds: editor.carteiraIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          metas: {
            mensal: toNumberOrNull(editor.metaMensal),
            trimestral: toNumberOrNull(editor.metaTrimestral),
            anual: toNumberOrNull(editor.metaAnual),
          },
        },
      };

      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Falha ao atualizar usuário.');
      }

      setSuccess('Usuário atualizado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadingData) {
    return <div className={styles.loading}>Carregando usuários…</div>;
  }

  if (!isAdmin) return null;

  if (loadError) {
    return <div className={styles.error}>{loadError}</div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.topBar}>
        <h2 className={styles.title}>Usuários</h2>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Buscar por e-mail, nome, região…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      <section className={styles.grid}>
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>Lista</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>E-mail</th>
                  <th>Nome</th>
                  <th>Região</th>
                  <th>Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.uid}>
                    <td>{u.email}</td>
                    <td>{u.displayName || u.profile?.nomeComercial || '—'}</td>
                    <td>{u.profile?.regiao || '—'}</td>
                    <td>
                      <span className={`${styles.roleBadge} ${u.isAdmin ? styles.roleAdmin : styles.roleRep}`}>
                        {u.isAdmin ? 'admin' : 'representante'}
                      </span>
                    </td>
                    <td>
                      <button type="button" className={styles.editButton} onClick={() => openEditor(u)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>Editor</h3>

          {!selected ? (
            <p className={styles.empty}>Selecione um usuário para editar.</p>
          ) : (
            <form className={styles.form} onSubmit={handleSave}>
              <div className={styles.formGrid}>
                <label>
                  Nome
                  <input
                    value={editor.displayName}
                    onChange={(e) => setEditor((p) => ({ ...p, displayName: e.target.value }))}
                  />
                </label>

                <label>
                  Role
                  <select
                    value={editor.role}
                    onChange={(e) => setEditor((p) => ({ ...p, role: e.target.value as UserRole }))}
                  >
                    <option value="representante">representante</option>
                    <option value="admin">admin</option>
                  </select>
                </label>

                <label>
                  Nome comercial
                  <input
                    value={editor.nomeComercial}
                    onChange={(e) => setEditor((p) => ({ ...p, nomeComercial: e.target.value }))}
                  />
                </label>

                <label>
                  Telefone
                  <input
                    value={editor.telefone}
                    onChange={(e) => setEditor((p) => ({ ...p, telefone: e.target.value }))}
                  />
                </label>

                <label>
                  Região
                  <input
                    value={editor.regiao}
                    onChange={(e) => setEditor((p) => ({ ...p, regiao: e.target.value }))}
                  />
                </label>

                <label>
                  Avatar URL
                  <input
                    value={editor.avatarUrl}
                    onChange={(e) => setEditor((p) => ({ ...p, avatarUrl: e.target.value }))}
                  />
                </label>

                <label>
                  Idioma
                  <input
                    value={editor.idioma}
                    onChange={(e) => setEditor((p) => ({ ...p, idioma: e.target.value }))}
                  />
                </label>

                <label>
                  Moeda
                  <input
                    value={editor.moeda}
                    onChange={(e) => setEditor((p) => ({ ...p, moeda: e.target.value }))}
                  />
                </label>

                <label>
                  Tema
                  <select
                    value={editor.tema}
                    onChange={(e) => setEditor((p) => ({ ...p, tema: e.target.value }))}
                  >
                    <option value="light">light</option>
                    <option value="dark">dark</option>
                  </select>
                </label>

                <label>
                  Time ID
                  <input
                    value={editor.timeId}
                    onChange={(e) => setEditor((p) => ({ ...p, timeId: e.target.value }))}
                  />
                </label>

                <label className={styles.full}>
                  Carteiras (ids separados por vírgula)
                  <input
                    value={editor.carteiraIds}
                    onChange={(e) => setEditor((p) => ({ ...p, carteiraIds: e.target.value }))}
                  />
                </label>

                <label>
                  Meta mensal
                  <input
                    value={editor.metaMensal}
                    onChange={(e) => setEditor((p) => ({ ...p, metaMensal: e.target.value }))}
                  />
                </label>

                <label>
                  Meta trimestral
                  <input
                    value={editor.metaTrimestral}
                    onChange={(e) => setEditor((p) => ({ ...p, metaTrimestral: e.target.value }))}
                  />
                </label>

                <label>
                  Meta anual
                  <input
                    value={editor.metaAnual}
                    onChange={(e) => setEditor((p) => ({ ...p, metaAnual: e.target.value }))}
                  />
                </label>
              </div>

              <div className={styles.checkboxRow}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={editor.notificacoesEmail}
                    onChange={(e) => setEditor((p) => ({ ...p, notificacoesEmail: e.target.checked }))}
                  />
                  Notificações por e-mail
                </label>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={editor.notificacoesPush}
                    onChange={(e) => setEditor((p) => ({ ...p, notificacoesPush: e.target.checked }))}
                  />
                  Notificações push
                </label>
              </div>

              {error && <p className={styles.error}>{error}</p>}
              {success && <p className={styles.success}>{success}</p>}

              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={closeEditor}>
                  Fechar
                </button>
                <button type="submit" className={styles.primary} disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
