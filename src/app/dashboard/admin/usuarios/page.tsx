'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './usuarios-admin.module.css';

type UserRole = 'admin' | 'representante';

interface VendedorOption {
  nome: string;
  email: string;
}

const VENDEDORES: VendedorOption[] = [
  { nome: 'João Tiuzsi', email: 'comercial3@tecassistiva.com.br' },
  { nome: 'Joelson Souza', email: 'joelsonsouza@tecassistiva.com.br' },
  { nome: 'Pollyana Meira', email: 'comercial2@tecassistiva.com.br' },
  { nome: 'Lucas Cavalcante', email: 'comercial5@tecassistiva.com.br' },
  { nome: 'Jessica Cruz', email: 'comercial6@tecassistiva.com.br' },
];

const REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

const UFS_POR_REGIAO: Record<string, string[]> = {
  Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};

interface UserDoc {
  id: string;
  uid?: string;
  email: string;
  displayName?: string | null;
  role?: UserRole;
  isAdmin?: boolean;
  profile?: {
    nomeComercial?: string | null;
    telefone?: string | null;
    regiao?: string | null;
    uf?: string | null;
  };
  sales?: {
    nomeVendedor?: string | null;
    emailVendedor?: string | null;
  };
}

const DEFAULT_EDITOR = {
  displayName: '',
  role: 'representante' as UserRole,
  nomeComercial: '',
  telefone: '',
  email: '',
  regiao: '',
  uf: '',
  nomeVendedor: '',
  emailVendedor: '',
};

const DEFAULT_INVITE = {
  displayName: '',
  email: '',
  role: 'representante' as UserRole,
  nomeComercial: '',
  telefone: '',
  regiao: '',
  uf: '',
  nomeVendedor: '',
  emailVendedor: '',
};

function AdminUsuariosPageInner() {
  const { user, isAdmin, loading, refreshClaims } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selected, setSelected] = useState<UserDoc | null>(null);
  const [editor, setEditor] = useState(DEFAULT_EDITOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState(DEFAULT_INVITE);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteResetLink, setInviteResetLink] = useState('');
  const [deleting, setDeleting] = useState<string>('');

  const selectedUid = selected?.uid || selected?.id || '';
  const isEditingCurrentUser = Boolean(user?.uid && selectedUid && user.uid === selectedUid);
  const search = searchParams.get('q') ?? '';
  const inviteOpen = searchParams.get('invite') === '1';

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
      email: item.email ?? '',
      regiao: item.profile?.regiao ?? '',
      uf: item.profile?.uf ?? '',
      nomeVendedor: item.sales?.nomeVendedor ?? '',
      emailVendedor: item.sales?.emailVendedor ?? '',
    });
  }

  function closeEditor() {
    setSelected(null);
    setError('');
    setSuccess('');
  }

  function handleVendedorChange(email: string) {
    if (!email) {
      setEditor((p) => ({ ...p, nomeVendedor: '', emailVendedor: '' }));
      return;
    }

    const vendedor = VENDEDORES.find((item) => item.email === email);
    if (!vendedor) return;

    setEditor((p) => ({
      ...p,
      nomeVendedor: vendedor.nome,
      emailVendedor: vendedor.email,
    }));
  }

  function handleInviteVendedorChange(email: string) {
    if (!email) {
      setInvite((p) => ({ ...p, nomeVendedor: '', emailVendedor: '' }));
      return;
    }

    const vendedor = VENDEDORES.find((item) => item.email === email);
    if (!vendedor) return;

    setInvite((p) => ({
      ...p,
      nomeVendedor: vendedor.nome,
      emailVendedor: vendedor.email,
    }));
  }

  function handleRegiaoChange(regiao: string) {
    setEditor((prev) => {
      const ufsDaRegiao = regiao ? (UFS_POR_REGIAO[regiao] ?? []) : [];
      const ufAtualValida = prev.uf && ufsDaRegiao.includes(prev.uf);

      return {
        ...prev,
        regiao,
        uf: ufAtualValida ? prev.uf : '',
      };
    });
  }

  function handleInviteRegiaoChange(regiao: string) {
    setInvite((prev) => {
      const ufsDaRegiao = regiao ? (UFS_POR_REGIAO[regiao] ?? []) : [];
      const ufAtualValida = prev.uf && ufsDaRegiao.includes(prev.uf);

      return {
        ...prev,
        regiao,
        uf: ufAtualValida ? prev.uf : '',
      };
    });
  }

  const ufsDisponiveis = useMemo(() => {
    if (!editor.regiao) return [];
    return UFS_POR_REGIAO[editor.regiao] ?? [];
  }, [editor.regiao]);

  const inviteUfsDisponiveis = useMemo(() => {
    if (!invite.regiao) return [];
    return UFS_POR_REGIAO[invite.regiao] ?? [];
  }, [invite.regiao]);

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

      const payload = {
        targetUid: selected.uid || selected.id,
        role: editor.role,
        email: editor.email.trim() || null,
        displayName: editor.displayName || null,
        profile: {
          nomeComercial: editor.nomeComercial || null,
          telefone: editor.telefone || null,
          regiao: editor.regiao || null,
          uf: editor.uf || null,
        },
        sales: {
          nomeVendedor: editor.nomeVendedor || null,
          emailVendedor: editor.emailVendedor || null,
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

      if (isEditingCurrentUser) {
        await refreshClaims();
      }

      setSuccess('Usuário atualizado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  }

  async function handleInviteUser(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    setInviting(true);
    setInviteError('');
    setInviteSuccess('');
    setInviteResetLink('');

    try {
      const idToken = await user.getIdToken();
      const payload = {
        email: invite.email.trim(),
        displayName: invite.displayName.trim() || null,
        role: invite.role,
        profile: {
          nomeComercial: invite.nomeComercial || null,
          telefone: invite.telefone || null,
          regiao: invite.regiao || null,
          uf: invite.uf || null,
        },
        sales: {
          nomeVendedor: invite.nomeVendedor || null,
          emailVendedor: invite.emailVendedor || null,
        },
      };

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Falha ao convidar usuário.');
      }

      const emailMsg = data.emailSent
        ? `Usuário convidado com sucesso. Um email foi enviado para ${invite.email.trim()}.`
        : 'Usuário convidado com sucesso. Copie o link abaixo e envie para o usuário.';
      setInviteSuccess(emailMsg);
      setInviteResetLink(!data.emailSent && typeof data.resetLink === 'string' ? data.resetLink : '');
      setInvite(DEFAULT_INVITE);

      const params = new URLSearchParams(searchParams.toString());
      params.delete('invite');
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao convidar usuário.');
    } finally {
      setInviting(false);
    }
  }

  async function handleDeleteUser(targetUid: string, email: string) {
    if (!user) return;
    const confirmed = window.confirm(
      `Excluir o usuário "${email}"?\n\nEsta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    setDeleting(targetUid);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ targetUid }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Falha ao excluir usuário.');
      }
      if (selected && (selected.uid === targetUid || selected.id === targetUid)) {
        closeEditor();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir usuário.');
    } finally {
      setDeleting('');
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
      {(inviteOpen || inviteError || inviteSuccess || inviteResetLink) ? (
        <section className={styles.card}>
          {inviteOpen && (
          <form className={styles.form} onSubmit={handleInviteUser}>
            <div className={styles.formGrid}>
              <label>
                Nome
                <input
                  value={invite.displayName}
                  onChange={(e) => setInvite((p) => ({ ...p, displayName: e.target.value }))}
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  required
                  value={invite.email}
                  onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value }))}
                />
              </label>

              <label>
                Role
                <select
                  value={invite.role}
                  onChange={(e) => setInvite((p) => ({ ...p, role: e.target.value as UserRole }))}
                >
                  <option value="representante">representante</option>
                  <option value="admin">admin</option>
                </select>
              </label>

              <label>
                Nome da Empresa
                <input
                  value={invite.nomeComercial}
                  onChange={(e) => setInvite((p) => ({ ...p, nomeComercial: e.target.value }))}
                />
              </label>

              <label>
                Telefone
                <input
                  value={invite.telefone}
                  onChange={(e) => setInvite((p) => ({ ...p, telefone: e.target.value }))}
                />
              </label>

              <label>
                Região
                <select
                  value={invite.regiao}
                  onChange={(e) => handleInviteRegiaoChange(e.target.value)}
                >
                  <option value="">Selecione a região</option>
                  {REGIOES.map((regiao) => (
                    <option key={regiao} value={regiao}>{regiao}</option>
                  ))}
                </select>
              </label>

              <label>
                UF
                <select
                  value={invite.uf}
                  onChange={(e) => setInvite((p) => ({ ...p, uf: e.target.value }))}
                  disabled={!invite.regiao}
                >
                  <option value="">{invite.regiao ? 'Selecione a UF' : 'Selecione primeiro a região'}</option>
                  {inviteUfsDisponiveis.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </label>

              <label>
                Vendedor
                <select
                  value={invite.emailVendedor}
                  onChange={(e) => handleInviteVendedorChange(e.target.value)}
                >
                  <option value="">Selecione um vendedor</option>
                  {VENDEDORES.map((vendedor) => (
                    <option key={vendedor.email} value={vendedor.email}>
                      {vendedor.nome} ({vendedor.email})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={inviting}>
                {inviting ? 'Convidando…' : 'Confirmar convite'}
              </button>
            </div>
          </form>
          )}

          {inviteError && <p className={styles.error}>{inviteError}</p>}
          {inviteSuccess && <p className={styles.success}>{inviteSuccess}</p>}
          {inviteResetLink && (
            <p className={styles.success}>Link de redefinição: {inviteResetLink}</p>
          )}
        </section>
      ) : null}

      <section className={styles.card}>
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
                <tr key={u.uid || u.id}>
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
                    {(u.uid || u.id) !== user?.uid && (
                      <button
                        type="button"
                        className={styles.deleteButton}
                        disabled={deleting === (u.uid || u.id)}
                        onClick={() => handleDeleteUser(u.uid || u.id, u.email)}
                      >
                        {deleting === (u.uid || u.id) ? '…' : 'Excluir'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <div className={styles.modalOverlay} role="presentation" onClick={closeEditor}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="editor-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.sectionTitle} id="editor-modal-title">Editar usuário</h3>
              <button type="button" className={styles.modalCloseButton} onClick={closeEditor} aria-label="Fechar editor">
                ✕
              </button>
            </div>

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
                    disabled={isEditingCurrentUser}
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
                  Email
                  <input
                    type="email"
                    value={editor.email}
                    onChange={(e) => setEditor((p) => ({ ...p, email: e.target.value }))}
                    readOnly={isEditingCurrentUser}
                  />
                </label>

                <label>
                  Região
                  <select
                    value={editor.regiao}
                    onChange={(e) => handleRegiaoChange(e.target.value)}
                  >
                    <option value="">Selecione a região</option>
                    {REGIOES.map((regiao) => (
                      <option key={regiao} value={regiao}>{regiao}</option>
                    ))}
                  </select>
                </label>

                <label>
                  UF
                  <select
                    value={editor.uf}
                    onChange={(e) => setEditor((p) => ({ ...p, uf: e.target.value }))}
                    disabled={!editor.regiao}
                  >
                    <option value="">{editor.regiao ? 'Selecione a UF' : 'Selecione primeiro a região'}</option>
                    {ufsDisponiveis.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Vendedor
                  <select
                    value={editor.emailVendedor}
                    onChange={(e) => handleVendedorChange(e.target.value)}
                  >
                    <option value="">Selecione um vendedor</option>
                    {VENDEDORES.map((vendedor) => (
                      <option key={vendedor.email} value={vendedor.email}>
                        {vendedor.nome} ({vendedor.email})
                      </option>
                    ))}
                  </select>
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
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminUsuariosPage() {
  return (
    <Suspense fallback={<div className={styles.loading}>Carregando usuários…</div>}>
      <AdminUsuariosPageInner />
    </Suspense>
  );
}
