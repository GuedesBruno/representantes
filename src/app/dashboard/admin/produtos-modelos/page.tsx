'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Color from '@tiptap/extension-color';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './produtos-admin.module.css';

export interface Produto {
  id: string;
  nome: string;
  nomeAbreviado?: string;
  ordemExibicao?: number;
  categoria?: string;
  fotoUrl: string;
  catalogoUrl?: string;
  fotoPublicId?: string;
  precoUnitario: number;
  linkSite: string;
  videoUrl?: string;
  descricaoCurta: string;
  descricao?: string;
  criadoEm?: { toDate(): Date };
  atualizadoEm?: { toDate(): Date };
}

type Mode = 'list' | 'form' | 'import';

const EMPTY_FORM = {
  nome: '',
  nomeAbreviado: '',
  ordemExibicao: '',
  categoria: '',
  fotoUrl: '',
  catalogoUrl: '',
  precoUnitario: '',
  linkSite: '',
  videoUrl: '',
  descricaoCurta: '',
  descricao: '',
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function parseDelimitedLine(line: string, delimiter: ',' | ';'): string[] {
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
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectDelimiter(headerLine: string): ',' | ';' {
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

function normalizeRow(values: unknown[]): typeof EMPTY_FORM {
  const toText = (v: unknown) => String(v ?? '').trim();
  return {
    nome: toText(values[0]),
    nomeAbreviado: toText(values[1]),
    categoria: toText(values[2]),
    fotoUrl: toText(values[3]),
    catalogoUrl: toText(values[4]),
    precoUnitario: toText(values[5]),
    linkSite: toText(values[6]),
    videoUrl: toText(values[7]),
    descricaoCurta: toText(values[8]),
    ordemExibicao: toText(values[9]),
    descricao: toText(values[10]),
  };
}

function parseOrderInput(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parsePrecoInput(raw: string): number {
  const value = raw.trim();
  if (!value) return NaN;

  // Accept common BR formats like "R$ 28.000,00" and plain "28000.00".
  const cleaned = value
    .replace(/\s+/g, '')
    .replace(/^R\$/i, '')
    .replace(/[^\d,.-]/g, '');

  if (!cleaned || cleaned === '-' || cleaned === '--') return NaN;

  const hasComma = cleaned.includes(',');
  const normalized = hasComma
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function stripHtml(html?: string) {
  return String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const FONT_SIZES = ['12px', '14px', '16px', '18px', '22px', '28px'];
const TEXT_COLORS = ['#111827', '#1f2937', '#2563eb', '#166534', '#b45309', '#b91c1c', '#7c3aed'];

function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontSize,
      Color,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== (value || '')) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return <div className={styles.editorLoading}>Carregando editor...</div>;
  }

  return (
    <div className={styles.richEditorWrapper}>
      <div className={styles.editorToolbar}>
        <button type="button" className={styles.toolbarButton} onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
        <button type="button" className={styles.toolbarButton} onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
        <button type="button" className={styles.toolbarButton} onClick={() => editor.chain().focus().toggleStrike().run()}>S</button>
        <button type="button" className={styles.toolbarButton} onClick={() => editor.chain().focus().toggleBulletList().run()}>Lista</button>
        <button type="button" className={styles.toolbarButton} onClick={() => editor.chain().focus().setTextAlign('left').run()}>Esq</button>
        <button type="button" className={styles.toolbarButton} onClick={() => editor.chain().focus().setTextAlign('center').run()}>Centro</button>
        <button type="button" className={styles.toolbarButton} onClick={() => editor.chain().focus().setTextAlign('right').run()}>Dir</button>
        <select
          className={styles.toolbarSelect}
          defaultValue=""
          onChange={(event) => {
            const size = event.target.value;
            if (!size) return;
            editor.chain().focus().setFontSize(size).run();
          }}
        >
          <option value="">Tamanho</option>
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <select
          className={styles.toolbarSelect}
          defaultValue=""
          onChange={(event) => {
            const color = event.target.value;
            if (!color) return;
            editor.chain().focus().setColor(color).run();
          }}
        >
          <option value="">Cor</option>
          {TEXT_COLORS.map((color) => (
            <option key={color} value={color}>{color}</option>
          ))}
        </select>
      </div>
      <EditorContent editor={editor} className={styles.editorContent} />
    </div>
  );
}

export default function ProdutosAdminPage() {
  const { isAdmin, loading, user } = useAuth();
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
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
  const [isProcessingFile, setIsProcessingFile] = useState(false);
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
    const unsub = onSnapshot(
      collection(db, 'produtos'),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Produto));
        docs.sort((a, b) => {
          const ordemA = Number.isFinite(a.ordemExibicao) ? Number(a.ordemExibicao) : Number.MAX_SAFE_INTEGER;
          const ordemB = Number.isFinite(b.ordemExibicao) ? Number(b.ordemExibicao) : Number.MAX_SAFE_INTEGER;
          if (ordemA !== ordemB) return ordemA - ordemB;
          return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
        });
        setProdutos(docs);
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

  function openEdit(p: Produto) {
    setEditingId(p.id);
    setForm({
      nome: p.nome,
      nomeAbreviado: p.nomeAbreviado ?? '',
      ordemExibicao: p.ordemExibicao != null ? String(p.ordemExibicao) : '',
      categoria: p.categoria ?? '',
      fotoUrl: p.fotoUrl,
      catalogoUrl: p.catalogoUrl ?? '',
      precoUnitario: String(p.precoUnitario),
      linkSite: p.linkSite,
      videoUrl: p.videoUrl ?? '',
      descricaoCurta: p.descricaoCurta,
      descricao: p.descricao ?? '',
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
    const preco = parsePrecoInput(form.precoUnitario);
    const ordemExibicao = parseOrderInput(form.ordemExibicao);
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return; }
    if (isNaN(preco) || preco < 0) { setError('Preço inválido.'); return; }
    if (form.ordemExibicao.trim() && ordemExibicao === null) { setError('Ordem de exibição inválida. Use um número inteiro maior que zero.'); return; }

    setSubmitting(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        nomeAbreviado: form.nomeAbreviado.trim(),
        ordemExibicao,
        categoria: form.categoria.trim(),
        fotoUrl: form.fotoUrl.trim(),
        catalogoUrl: form.catalogoUrl.trim(),
        precoUnitario: preco,
        linkSite: form.linkSite.trim(),
        videoUrl: form.videoUrl.trim(),
        descricaoCurta: form.descricaoCurta.trim(),
        descricao: form.descricao.trim(),
        atualizadoEm: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'produtos', editingId), payload);
      } else {
        await addDoc(collection(db, 'produtos'), {
          ...payload,
          criadoEm: serverTimestamp(),
        });
      }

      // BACKUP AUTOMÁTICO: Salva uma cópia no histórico sempre que houver alteração
      try {
        await addDoc(collection(db, 'produtos_backups'), {
          ...payload,
          originalId: editingId || 'novo',
          backupEm: serverTimestamp(),
          responsavel: user?.email || 'sistema'
        });
      } catch (backupErr) {
        console.warn('Falha ao gerar backup automático, mas o produto foi salvo.', backupErr);
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
      await deleteDoc(doc(db, 'produtos', id));
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

    setIsProcessingFile(true);

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setTimeout(() => {
          try {
            const data = ev.target?.result as ArrayBuffer;
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) {
              setCsvError('Planilha sem aba válida.');
              return;
            }
  
            const worksheet = workbook.Sheets[firstSheetName];
            const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as unknown[][];
  
            if (rawRows.length < 2) {
              setCsvError('Planilha vazia ou sem dados além do cabeçalho.');
              return;
            }
  
            const rows: typeof EMPTY_FORM[] = [];
            for (let i = 1; i < rawRows.length; i++) {
              const cols = rawRows[i] ?? [];
              if (cols.every((c) => String(c ?? '').trim() === '')) continue;
              if (cols.length < 5) {
                setCsvError(`Linha ${i + 1} inválida: esperadas ao menos 5 colunas (nome, fotoUrl, precoUnitario, linkSite, descricaoCurta) e até 11 colunas com nomeAbreviado, categoria, catalogoUrl, videoUrl, ordemExibicao e descricao.`);
                return;
              }
              if (cols.length === 5) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.splice(2, 0, ''); // categoria
                cols.splice(4, 0, ''); // catalogoUrl
                cols.splice(7, 0, ''); // videoUrl
                cols.push(''); // ordemExibicao
                cols.push(''); // descricao
              } else if (cols.length === 6) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.splice(2, 0, ''); // categoria
                cols.splice(4, 0, ''); // catalogoUrl
                cols.push(''); // videoUrl
                cols.push(''); // ordemExibicao
                cols.push(''); // descricao
              } else if (cols.length === 7) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.splice(2, 0, ''); // categoria
                cols.push(''); // catalogoUrl
                cols.push(''); // videoUrl
                cols.push(''); // ordemExibicao
                cols.push(''); // descricao
              } else if (cols.length === 8) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.push(''); // categoria
                cols.push(''); // catalogoUrl
                cols.push(''); // videoUrl
                cols.push(''); // ordemExibicao
                cols.push(''); // descricao
              } else if (cols.length === 9) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.push(''); // categoria
                cols.push(''); // catalogoUrl
                cols.push(''); // videoUrl
                cols.push(''); // ordemExibicao
              } else if (cols.length === 10) {
                cols.splice(1, 0, ''); // nomeAbreviado
                cols.push(''); // categoria
                cols.push(''); // catalogoUrl
                cols.push(''); // videoUrl
              }
              rows.push(normalizeRow(cols));
            }
  
            if (rows.length === 0) {
              setCsvError('Planilha sem linhas válidas para importação.');
              return;
            }
  
            setCsvPreview(rows);
          } catch {
            setCsvError('Erro ao ler arquivo Excel. Verifique se o arquivo está íntegro.');
          } finally {
            setIsProcessingFile(false);
          }
        }, 50);
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setTimeout(() => {
        try {
          const text = ev.target?.result as string;
          const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
          if (lines.length < 2) {
            setCsvError('Arquivo vazio ou sem dados além do cabeçalho.');
            return;
          }
    
          const delimiter = detectDelimiter(lines[0]);
    
          const rows: typeof EMPTY_FORM[] = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = parseDelimitedLine(lines[i], delimiter);
            if (cols.every((c) => c.trim() === '')) continue;
            if (cols.length < 5) {
              setCsvError(`Linha ${i + 1} inválida: esperadas ao menos 5 colunas (nome, fotoUrl, precoUnitario, linkSite, descricaoCurta) e até 11 colunas com nomeAbreviado, categoria, catalogoUrl, videoUrl, ordemExibicao e descricao. Delimitador detectado: "${delimiter}".`);
              return;
            }
            if (cols.length === 5) {
              cols.splice(1, 0, ''); // nomeAbreviado
              cols.splice(2, 0, ''); // categoria
              cols.splice(4, 0, ''); // catalogoUrl
              cols.splice(7, 0, ''); // videoUrl
              cols.push(''); // ordemExibicao
              cols.push(''); // descricao
            } else if (cols.length === 6) {
              cols.splice(1, 0, ''); // nomeAbreviado
              cols.splice(2, 0, ''); // categoria
              cols.splice(4, 0, ''); // catalogoUrl
              cols.push(''); // videoUrl
              cols.push(''); // ordemExibicao
              cols.push(''); // descricao
            } else if (cols.length === 7) {
              cols.splice(1, 0, ''); // nomeAbreviado
              cols.splice(2, 0, ''); // categoria
              cols.push(''); // catalogoUrl
              cols.push(''); // videoUrl
              cols.push(''); // ordemExibicao
              cols.push(''); // descricao
            } else if (cols.length === 8) {
              cols.splice(1, 0, ''); // nomeAbreviado
              cols.push(''); // categoria
              cols.push(''); // catalogoUrl
              cols.push(''); // videoUrl
              cols.push(''); // ordemExibicao
              cols.push(''); // descricao
            } else if (cols.length === 9) {
              cols.splice(1, 0, ''); // nomeAbreviado
              cols.push(''); // categoria
              cols.push(''); // catalogoUrl
              cols.push(''); // videoUrl
              cols.push(''); // ordemExibicao
            } else if (cols.length === 10) {
              cols.splice(1, 0, ''); // nomeAbreviado
              cols.push(''); // categoria
              cols.push(''); // catalogoUrl
              cols.push(''); // videoUrl
            }
            rows.push(normalizeRow(cols));
          }
    
          if (rows.length === 0) {
            setCsvError('Arquivo sem linhas válidas para importação.');
            return;
          }
          setCsvPreview(rows);
        } catch {
          setCsvError('Erro ao ler arquivo CSV/texto. Verifique o formato.');
        } finally {
          setIsProcessingFile(false);
        }
      }, 50);
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleCsvImport() {
    setCsvError('');
    setCsvSuccess('');
    setCsvImporting(true);
    try {
      let importedCount = 0;
      let skippedCount = 0;
      for (const row of csvPreview) {
        const preco = parsePrecoInput(row.precoUnitario);
        const ordemExibicao = parseOrderInput(row.ordemExibicao);
        if (!row.nome || isNaN(preco) || preco < 0) {
          skippedCount++;
          continue;
        }
        await addDoc(collection(db, 'produtos'), {
          nome: row.nome.trim(),
          nomeAbreviado: row.nomeAbreviado.trim(),
          ordemExibicao,
          categoria: row.categoria.trim(),
          fotoUrl: row.fotoUrl.trim(),
          catalogoUrl: row.catalogoUrl.trim(),
          precoUnitario: preco,
          linkSite: row.linkSite.trim(),
          videoUrl: row.videoUrl.trim(),
          descricaoCurta: row.descricaoCurta.trim(),
          descricao: row.descricao.trim(),
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        });
        importedCount++;
      }

      if (importedCount === 0) {
        setCsvError('Nenhum produto foi importado. Verifique principalmente a coluna de preço (ex.: R$ 28.000,00).');
      } else {
        const skippedMsg = skippedCount > 0 ? ` ${skippedCount} linha(s) foram puladas por dados inválidos.` : '';
        setCsvSuccess(`${importedCount} produto(s) importado(s) com sucesso.${skippedMsg}`);
      }

      setCsvPreview([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      setCsvError('Erro durante a importação. Verifique os dados e tente novamente.');
    } finally {
      setCsvImporting(false);
    }
  }

  function handleExportCsv() {
    if (produtos.length === 0) {
      alert('Não há produtos para exportar.');
      return;
    }

    const headers = [
      'nome',
      'nomeAbreviado',
      'categoria',
      'fotoUrl',
      'catalogoUrl',
      'precoUnitario',
      'linkSite',
      'videoUrl',
      'descricaoCurta',
      'ordemExibicao',
      'descricao'
    ];

    const rows = produtos.map(p => [
      `"${(p.nome || '').replace(/"/g, '""')}"`,
      `"${(p.nomeAbreviado || '').replace(/"/g, '""')}"`,
      `"${(p.categoria || '').replace(/"/g, '""')}"`,
      `"${p.fotoUrl || ''}"`,
      `"${p.catalogoUrl || ''}"`,
      p.precoUnitario,
      `"${p.linkSite || ''}"`,
      `"${p.videoUrl || ''}"`,
      `"${(p.descricaoCurta || '').replace(/"/g, '""')}"`,
      p.ordemExibicao || '',
      `"${(p.descricao || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    
    link.setAttribute('href', url);
    link.setAttribute('download', `backup_catalogo_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          <div className={styles.topActions}>
            <button type="button" className={styles.btnSecondary} onClick={handleExportCsv}>
              ⬇ Exportar Backup (CSV)
            </button>
            <button type="button" className={styles.btnPrimary} onClick={openNew}>
              + Novo Produto
            </button>
          </div>
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
                    <th className={`${styles.th} ${styles.desktopOnly}`}>Nome Abreviado</th>
                    <th className={`${styles.th} ${styles.desktopOnly}`}>Categoria</th>
                    <th className={`${styles.th} ${styles.desktopOnly}`}>Ordem</th>
                    <th className={`${styles.th} ${styles.desktopOnly}`}>Preço Unit.</th>
                    <th className={`${styles.th} ${styles.desktopOnly}`}>Link</th>
                    <th className={`${styles.th} ${styles.desktopOnly}`}>Catálogo</th>
                    <th className={`${styles.th} ${styles.desktopOnly}`}>Vídeo</th>
                    <th className={`${styles.th} ${styles.desktopOnly}`}>Descrição Curta</th>
                    <th className={`${styles.th} ${styles.desktopOnly}`}>Descrição</th>
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
                      <td className={`${styles.td} ${styles.desktopOnly}`}>{p.nomeAbreviado || '—'}</td>
                      <td className={`${styles.td} ${styles.desktopOnly}`}>{p.categoria || '—'}</td>
                      <td className={`${styles.td} ${styles.desktopOnly}`}>{p.ordemExibicao ?? '—'}</td>
                      <td className={styles.td}>{formatCurrency(p.precoUnitario)}</td>
                      <td className={`${styles.td} ${styles.desktopOnly}`}>
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
                      <td className={`${styles.td} ${styles.desktopOnly}`}>
                        {p.catalogoUrl ? (
                          <a
                            href={p.catalogoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                          >
                            Ver catálogo
                          </a>
                        ) : '—'}
                      </td>
                      <td className={`${styles.td} ${styles.desktopOnly}`}>
                        {p.videoUrl ? (
                          <a
                            href={p.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                          >
                            Ver vídeo
                          </a>
                        ) : '—'}
                      </td>
                      <td className={`${styles.td} ${styles.desktopOnly}`}>
                        <div className={styles.descCell} title={p.descricaoCurta}>{p.descricaoCurta || '—'}</div>
                      </td>
                      <td className={`${styles.td} ${styles.desktopOnly}`}>
                        <div className={styles.descCell} title={stripHtml(p.descricao)}>{stripHtml(p.descricao) || '—'}</div>
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
                <label className={styles.label} htmlFor="nomeAbreviado">Nome Abreviado</label>
                <input
                  id="nomeAbreviado"
                  name="nomeAbreviado"
                  type="text"
                  className={styles.input}
                  value={form.nomeAbreviado}
                  onChange={handleChange}
                  maxLength={80}
                  autoComplete="off"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="categoria">Categoria</label>
                <input
                  id="categoria"
                  name="categoria"
                  type="text"
                  className={styles.input}
                  value={form.categoria}
                  onChange={handleChange}
                  placeholder="Ex.: Eletrônicos"
                  autoComplete="off"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ordemExibicao">Ordem de Exibição</label>
                <input
                  id="ordemExibicao"
                  name="ordemExibicao"
                  type="number"
                  min={1}
                  className={styles.input}
                  value={form.ordemExibicao}
                  onChange={handleChange}
                  placeholder="Ex.: 1"
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
                <label className={styles.label} htmlFor="catalogoUrl">URL do Catálogo</label>
                <input
                  id="catalogoUrl"
                  name="catalogoUrl"
                  type="url"
                  className={styles.input}
                  value={form.catalogoUrl}
                  onChange={handleChange}
                  placeholder="https://..."
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="videoUrl">URL do Vídeo (Vimeo/YouTube)</label>
                <input
                  id="videoUrl"
                  name="videoUrl"
                  type="url"
                  className={styles.input}
                  value={form.videoUrl}
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
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label} htmlFor="descricao">Descrição</label>
                <RichTextEditor
                  value={form.descricao}
                  onChange={(nextDescription) => setForm((prev) => ({ ...prev, descricao: nextDescription }))}
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
          <h2 className={styles.cardTitle}>Importar Produtos via CSV/XLS/XLSX</h2>
          <p className={styles.importHelper}>
            O arquivo deve ter cabeçalho e as colunas na ordem:{' '}
            <code>nome, nomeAbreviado, categoria, fotoUrl, catalogoUrl, precoUnitario, linkSite, videoUrl, descricaoCurta, ordemExibicao(opcional), descricao(opcional)</code>
          </p>
          <div className={styles.field} style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <label className={styles.label} htmlFor="csvFile" style={{ marginBottom: 0 }}>Selecionar arquivo</label>
            <a href="/templates/produtos-modelos-exemplo.csv" download className={styles.link} style={{ fontSize: '0.875rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Baixar planilha de exemplo (.csv)
            </a>
          </div>
            <input
              id="csvFile"
              type="file"
              accept=".csv,text/csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className={styles.fileInput}
              ref={fileInputRef}
              onChange={handleCsvFile}
            />
          </div>

          {isProcessingFile && <p style={{ marginTop: '1rem', color: '#2563eb', fontWeight: 500 }}>Lendo o arquivo, por favor aguarde...</p>}

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
                      <th className={styles.th}>Nome Abreviado</th>
                      <th className={styles.th}>Categoria</th>
                      <th className={styles.th}>Ordem</th>
                      <th className={styles.th}>Preço</th>
                      <th className={styles.th}>Link</th>
                      <th className={styles.th}>Catálogo</th>
                      <th className={styles.th}>Vídeo</th>
                      <th className={styles.th}>Descrição Curta</th>
                      <th className={styles.th}>Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} className={styles.tr}>
                        <td className={styles.td}>{row.nome}</td>
                        <td className={styles.td}>{row.nomeAbreviado || '—'}</td>
                        <td className={styles.td}>{row.categoria || '—'}</td>
                        <td className={styles.td}>{row.ordemExibicao || '—'}</td>
                        <td className={styles.td}>{row.precoUnitario}</td>
                        <td className={styles.td}>{row.linkSite || '—'}</td>
                        <td className={styles.td}>{row.catalogoUrl || '—'}</td>
                        <td className={styles.td}>{row.videoUrl || '—'}</td>
                        <td className={styles.td}>{row.descricaoCurta || '—'}</td>
                        <td className={styles.td}>{row.descricao || '—'}</td>
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
