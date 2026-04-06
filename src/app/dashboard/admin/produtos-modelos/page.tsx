'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './produtos-admin.module.css';

export interface ProdutoModelo {
  id: string;
  nome: string;
  fotoUrl: string;
  fotoPublicId?: string;
  precoUnitario: number;
  linkSite: string;
  descricaoCurta: string;
  criadoEm?: { toDate(): Date };
  atualizadoEm?: { toDate(): Date };
}

type Mode = 'list' | 'form' | 'import';

const EMPTY_FORM = {
  nome: '',
  fotoUrl: '',
  precoUnitario: '',
  linkSite: '',
  descricaoCurta: '',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export default function ProdutosModelosAdminPage() {
  const { isAdmin, loading, user } = useAuth();
  const router = useRouter();
  const [produtos, setProdutos] = useState<ProdutoModelo[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<Mode>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [csvError, setCsvError] = useState('');
  const [csvPreview, setCsvPreview] = useState<typeof EMPTY_FORM[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvSuccess, setCsvSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  async function uploadImageToCloudinary(file: File) {
    if (!user) {
      throw new Error('Usuário não autenticado.');
    }

    const idToken = await user.getIdToken();
    const body = new FormData();
    body.append('file', file);
    body.append('folder', 'representantes/produtos');

    const response = await fetch('/api/uploads/cloudinary', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? 'Falha no upload da imagem.');
    }

    return data as { url: string; publicId: string };
  }

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isAdmin, loading, router]);

  useEffect(() => {
    const q = query(collection(db, 'produtos_modelos'), orderBy('nome'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProdutoModelo)));
        setLoadError('');
        setLoadingData(false);
      },
      () => {
        setLoadError('Não foi possível carregar os produtos. Verifique permissões e regras do Firestore.');
        setLoadingData(false);
      }
    );
    return unsub;
  }, []);

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
    setMode('form');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function openEdit(p: ProdutoModelo) {
    setEditingId(p.id);
    setForm({
      nome: p.nome,
      fotoUrl: p.fotoUrl,
      precoUnitario: String(p.precoUnitario),
      linkSite: p.linkSite,
      descricaoCurta: p.descricaoCurta,
    });
    setError('');
    setMode('form');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setUploadingImage(true);

    try {
      const upload = await uploadImageToCloudinary(file);
      setForm((prev) => ({ ...prev, fotoUrl: upload.url }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Erro ao enviar imagem.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const preco = parseFloat(form.precoUnitario.replace(',', '.'));
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return; }
    if (isNaN(preco) || preco < 0) { setError('Preço inválido.'); return; }

    setSubmitting(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        fotoUrl: form.fotoUrl.trim(),
        precoUnitario: preco,
        linkSite: form.linkSite.trim(),
        descricaoCurta: form.descricaoCurta.trim(),
        atualizadoEm: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'produtos_modelos', editingId), payload);
      } else {
        await addDoc(collection(db, 'produtos_modelos'), {
          ...payload,
          criadoEm: serverTimestamp(),
        });
      }
      setMode('list');
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDoc(doc(db, 'produtos_modelos', id));
      setDeleteConfirm(null);
    } catch {
      // noop
    }
  }

  function handleCsvFile(e: ChangeEvent<HTMLInputElement>) {
    setCsvError('');
    setCsvPreview([]);
    setCsvSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
      if (lines.length < 2) {
        setCsvError('Arquivo vazio ou sem dados além do cabeçalho.');
        return;
      }

      const rows: typeof EMPTY_FORM[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 5) {
          setCsvError(`Linha ${i + 1} inválida: esperadas 5 colunas (nome, fotoUrl, precoUnitario, linkSite, descricaoCurta).`);
          return;
        }
        rows.push({
          nome: cols[0],
          fotoUrl: cols[1],
          precoUnitario: cols[2],
          linkSite: cols[3],
          descricaoCurta: cols[4],
        });
      }
      setCsvPreview(rows);
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleCsvImport() {
    setCsvError('');
    setCsvImporting(true);
    try {
      for (const row of csvPreview) {
        const preco = parseFloat(row.precoUnitario.replace(',', '.'));
        if (!row.nome || isNaN(preco)) continue;
        await addDoc(collection(db, 'produtos_modelos'), {
          nome: row.nome.trim(),
          fotoUrl: row.fotoUrl.trim(),
          precoUnitario: preco,
          linkSite: row.linkSite.trim(),
          descricaoCurta: row.descricaoCurta.trim(),
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        });
      }
      setCsvSuccess(`${csvPreview.length} produto(s) importado(s) com sucesso.`);
      setCsvPreview([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setCsvError('Erro durante a importação. Verifique os dados e tente novamente.');
    } finally {
      setCsvImporting(false);
    }
  }

  if (loading || loadingData) {
    return <div className={styles.loading}>Carregando…</div>;
  }

  if (!isAdmin) return null;

  if (loadError) {
    return <div className={styles.errorMsg}>{loadError}</div>;
  }

  return (
    <div className={styles.page}>
      {/* Header actions */}
      <div className={styles.topBar}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${mode === 'list' ? styles.tabActive : ''}`}
            onClick={() => setMode('list')}
          >
            Lista de Produtos
          </button>
          <button
            type="button"
            className={`${styles.tab} ${mode === 'import' ? styles.tabActive : ''}`}
            onClick={() => { setMode('import'); setCsvPreview([]); setCsvSuccess(''); setCsvError(''); }}
          >
            Importar CSV
          </button>
        </div>
        {mode === 'list' && (
          <button type="button" className={styles.btnPrimary} onClick={openNew}>
            + Novo Produto
          </button>
        )}
      </div>

      {/* LIST MODE */}
      {mode === 'list' && (
        <div className={styles.card}>
          {produtos.length === 0 ? (
            <div className={styles.empty}>
              Nenhum produto cadastrado. Clique em "Novo Produto" ou importe um CSV.
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Foto</th>
                    <th className={styles.th}>Nome</th>
                    <th className={styles.th}>Preço Unit.</th>
                    <th className={styles.th}>Link</th>
                    <th className={styles.th}>Descrição</th>
                    <th className={styles.th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {produtos.map((p) => (
                    <tr key={p.id} className={styles.tr}>
                      <td className={styles.td}>
                        {p.fotoUrl ? (
                          <img
                            src={p.fotoUrl}
                            alt={p.nome}
                            className={styles.thumb}
                            loading="lazy"
                          />
                        ) : (
                          <div className={styles.thumbPlaceholder} aria-label="Sem foto" />
                        )}
                      </td>
                      <td className={styles.td}><span className={styles.productName}>{p.nome}</span></td>
                      <td className={styles.td}>{formatCurrency(p.precoUnitario)}</td>
                      <td className={styles.td}>
                        {p.linkSite ? (
                          <a
                            href={p.linkSite}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                          >
                            Ver site
                          </a>
                        ) : '—'}
                      </td>
                      <td className={styles.td}>
                        <span className={styles.descCell} title={p.descricaoCurta}>{p.descricaoCurta || '—'}</span>
                      </td>
                      <td className={styles.td}>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.btnEdit}
                            onClick={() => openEdit(p)}
                          >
                            Editar
                          </button>
                          {deleteConfirm === p.id ? (
                            <span className={styles.deleteConfirm}>
                              Confirmar?{' '}
                              <button type="button" className={styles.btnDanger} onClick={() => handleDelete(p.id)}>Sim</button>
                              {' '}
                              <button type="button" className={styles.btnCancel} onClick={() => setDeleteConfirm(null)}>Não</button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={styles.btnDanger}
                              onClick={() => setDeleteConfirm(p.id)}
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* FORM MODE */}
      {mode === 'form' && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>{editingId ? 'Editar Produto' : 'Novo Produto'}</h2>
          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="nome">Nome *</label>
                <input
                  id="nome"
                  name="nome"
                  type="text"
                  className={styles.input}
                  value={form.nome}
                  onChange={handleChange}
                  required
                  autoComplete="off"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="precoUnitario">Preço Unitário (R$) *</label>
                <input
                  id="precoUnitario"
                  name="precoUnitario"
                  type="text"
                  inputMode="decimal"
                  className={styles.input}
                  value={form.precoUnitario}
                  onChange={handleChange}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="fotoUrl">URL da Foto</label>
                <input
                  id="fotoUrl"
                  name="fotoUrl"
                  type="url"
                  className={styles.input}
                  value={form.fotoUrl}
                  onChange={handleChange}
                  placeholder="https://..."
                />
                <div className={styles.uploadRow}>
                  <input
                    id="fotoUpload"
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.fileInput}
                    onChange={handleImageUpload}
                  />
                  <span className={styles.uploadHint}>
                    {uploadingImage ? 'Enviando para o Cloudinary...' : 'Ou envie uma imagem diretamente para o Cloudinary.'}
                  </span>
                </div>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="linkSite">Link no Site</label>
                <input
                  id="linkSite"
                  name="linkSite"
                  type="url"
                  className={styles.input}
                  value={form.linkSite}
                  onChange={handleChange}
                  placeholder="https://..."
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="descricaoCurta">Descrição Curta</label>
                <textarea
                  id="descricaoCurta"
                  name="descricaoCurta"
                  className={styles.textarea}
                  value={form.descricaoCurta}
                  onChange={handleChange}
                  rows={3}
                />
              </div>
            </div>
            {error && <p className={styles.errorMsg} role="alert">{error}</p>}
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setMode('list')}
                disabled={submitting}
              >
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                {submitting ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* IMPORT MODE */}
      {mode === 'import' && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Importar Produtos via CSV</h2>
          <p className={styles.importHelper}>
            O arquivo CSV deve ter cabeçalho e as colunas na ordem:{' '}
            <code>nome, fotoUrl, precoUnitario, linkSite, descricaoCurta</code>
          </p>
          <div className={styles.field} style={{ marginTop: '1rem' }}>
            <label className={styles.label} htmlFor="csvFile">Selecionar arquivo CSV</label>
            <input
              id="csvFile"
              type="file"
              accept=".csv,text/csv"
              className={styles.fileInput}
              ref={fileInputRef}
              onChange={handleCsvFile}
            />
          </div>

          {csvError && <p className={styles.errorMsg} role="alert">{csvError}</p>}
          {csvSuccess && <p className={styles.successMsg} role="status">{csvSuccess}</p>}

          {csvPreview.length > 0 && (
            <>
              <p className={styles.previewLabel}>{csvPreview.length} linha(s) encontrada(s) — pré-visualização:</p>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Nome</th>
                      <th className={styles.th}>Preço</th>
                      <th className={styles.th}>Link</th>
                      <th className={styles.th}>Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} className={styles.tr}>
                        <td className={styles.td}>{row.nome}</td>
                        <td className={styles.td}>{row.precoUnitario}</td>
                        <td className={styles.td}>{row.linkSite || '—'}</td>
                        <td className={styles.td}>{row.descricaoCurta || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvPreview.length > 10 && (
                  <p className={styles.importHelper}>… e mais {csvPreview.length - 10} linha(s).</p>
                )}
              </div>
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={handleCsvImport}
                  disabled={csvImporting}
                >
                  {csvImporting ? 'Importando…' : `Confirmar Importação (${csvPreview.length} produtos)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
