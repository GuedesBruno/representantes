'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from './folhetos.module.css';

interface Folheto {
  id: string;
  nome: string;
  arquivoNome: string;
  arquivoUrl: string;
  storagePath: string;
  cloudinaryPublicId?: string;
  resourceType?: string;
  contentType: string;
  tamanhoBytes: number;
  criadoPorEmail?: string;
  criadoEm?: { toDate(): Date };
}

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function formatDate(date?: Date) {
  if (!date) return 'Agora';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatSize(bytes: number) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function FolhetoPreview({ item }: { item: Folheto }) {
  if (item.contentType.startsWith('image/')) {
    return (
      <img
        className={styles.previewImage}
        src={item.arquivoUrl}
        alt={`Prévia do folheto ${item.nome}`}
        loading="lazy"
      />
    );
  }

  if (item.contentType === 'application/pdf') {
    return (
      <iframe
        title={`Prévia do folheto ${item.nome}`}
        src={`${item.arquivoUrl}#toolbar=0&navpanes=0&scrollbar=0`}
        className={styles.previewFrame}
      />
    );
  }

  return (
    <div className={styles.previewFallback} aria-label="Arquivo sem pré-visualização">
      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Sem miniatura para este tipo de arquivo</span>
    </div>
  );
}

export default function FolhetosPage() {
  const { user, isAdmin } = useAuth();
  const [nome, setNome] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [folhetos, setFolhetos] = useState<Folheto[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function uploadToCloudinary(file: File, idToken: string) {
    const body = new FormData();
    body.append('file', file);
    body.append('folder', 'representantes/folhetos');

    const response = await fetch('/api/uploads/cloudinary', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? 'Falha no upload do arquivo.');
    }

    return data as {
      url: string;
      publicId: string;
      bytes: number;
      resourceType: string;
    };
  }

  useEffect(() => {
    const q = query(collection(db, 'folhetos'), orderBy('criadoEm', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Folheto[];
        setFolhetos(docs);
        setLoadingList(false);
      },
      () => {
        setLoadingList(false);
        setMessage('Não foi possível carregar os folhetos agora.');
      }
    );

    return unsubscribe;
  }, []);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setArquivo(selected);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!isAdmin) {
      setSubmitState('error');
      setMessage('Somente administradores podem cadastrar folhetos.');
      return;
    }

    if (!nome.trim() || !arquivo || !user) {
      setSubmitState('error');
      setMessage('Informe o nome do folheto e selecione um arquivo.');
      return;
    }

    setSubmitState('loading');

    try {
      const idToken = await user.getIdToken();
      const upload = await uploadToCloudinary(arquivo, idToken);

      await addDoc(collection(db, 'folhetos'), {
        nome: nome.trim(),
        arquivoNome: arquivo.name,
        arquivoUrl: upload.url,
        storagePath: upload.publicId,
        cloudinaryPublicId: upload.publicId,
        resourceType: upload.resourceType,
        contentType: arquivo.type || 'application/octet-stream',
        tamanhoBytes: upload.bytes,
        criadoPorUid: user.uid,
        criadoPorEmail: user.email,
        criadoEm: serverTimestamp(),
      });

      setSubmitState('success');
      setMessage('Folheto cadastrado com sucesso.');
      setNome('');
      setArquivo(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch {
      setSubmitState('error');
      setMessage('Não foi possível enviar o folheto. Verifique a configuração do Cloudinary e as permissões de admin.');
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.topCard}>
        <div>
          <h2 className={styles.sectionTitle}>Biblioteca de Folhetos</h2>
          <p className={styles.sectionText}>
            Os folhetos cadastrados aparecem com miniatura e podem ser baixados em um clique.
          </p>
        </div>

        {isAdmin ? (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label htmlFor="nomeFolheto" className={styles.label}>Nome do folheto</label>
              <input
                id="nomeFolheto"
                className={styles.input}
                type="text"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Ex.: Linha Escolar 2026"
                maxLength={120}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="arquivoFolheto" className={styles.label}>Arquivo</label>
              <input
                id="arquivoFolheto"
                ref={fileInputRef}
                className={styles.fileInput}
                type="file"
                accept="application/pdf,image/*"
                onChange={handleFileChange}
              />
              <p className={styles.helper}>Formatos aceitos para miniatura: PDF e imagens.</p>
            </div>

            <button className={styles.submitButton} type="submit" disabled={submitState === 'loading'}>
              {submitState === 'loading' ? 'Enviando...' : 'Cadastrar folheto'}
            </button>
          </form>
        ) : (
          <div className={styles.adminOnly} role="note">
            Somente administradores podem cadastrar novos folhetos.
          </div>
        )}

        {message && (
          <div
            className={`${styles.message} ${submitState === 'error' ? styles.messageError : styles.messageSuccess}`}
            role="status"
          >
            {message}
          </div>
        )}
      </section>

      {loadingList ? (
        <div className={styles.state}>Carregando folhetos...</div>
      ) : folhetos.length === 0 ? (
        <div className={styles.state}>Nenhum folheto cadastrado ainda.</div>
      ) : (
        <section className={styles.grid} aria-label="Lista de folhetos">
          {folhetos.map((item) => {
            const criadoEm = item.criadoEm?.toDate?.();
            return (
              <article key={item.id} className={styles.card}>
                <div className={styles.previewWrap}>
                  <FolhetoPreview item={item} />
                </div>

                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{item.nome}</h3>
                  <p className={styles.cardMeta}>{item.arquivoNome} · {formatSize(item.tamanhoBytes)}</p>
                  <p className={styles.cardMeta}>Publicado em {formatDate(criadoEm)}</p>

                  <a
                    className={styles.downloadButton}
                    href={item.arquivoUrl}
                    download={item.arquivoNome}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download
                  </a>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
