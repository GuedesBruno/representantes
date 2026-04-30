'use client';

import { ChangeEvent, FormEvent, useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, where, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import styles from '../atas.module.css';

interface Documento {
  id: string;
  pastaId: string;
  nome: string;
  arquivoNome: string;
  arquivoUrl: string;
  storagePath: string;
  cloudinaryPublicId?: string;
  resourceType?: string;
  ordemExibicao?: number;
  contentType: string;
  tamanhoBytes: number;
  criadoPorEmail?: string;
  criadoEm?: { toDate(): Date };
}

interface Pasta {
  nome: string;
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

function getCloudinaryCloudNameFromUrl(url: string): string | null {
  const match = url.match(/res\.cloudinary\.com\/([^/]+)/i);
  return match?.[1] ?? null;
}

function getDocPreviewUrl(item: Documento): string | null {
  if (!item.cloudinaryPublicId) {
    return item.contentType.startsWith('image/') ? item.arquivoUrl : null;
  }

  const cloudName = getCloudinaryCloudNameFromUrl(item.arquivoUrl);
  if (!cloudName) {
    return item.contentType.startsWith('image/') ? item.arquivoUrl : null;
  }

  if (item.contentType === 'application/pdf') {
    return `https://res.cloudinary.com/${cloudName}/image/upload/pg_1,f_auto,q_auto,w_900/${item.cloudinaryPublicId}.jpg`;
  }

  if (item.contentType.startsWith('image/')) {
    return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,w_900/${item.cloudinaryPublicId}`;
  }

  return null;
}

function DocPreview({ item }: { item: Documento }) {
  const previewUrl = getDocPreviewUrl(item);

  if (previewUrl) {
    return (
      <img
        className={styles.previewImage}
        src={previewUrl}
        alt={`Prévia do documento ${item.nome}`}
        loading="lazy"
      />
    );
  }

  return (
    <div className={styles.previewFallback} aria-label="Arquivo sem pré-visualização">
      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
      <span>Sem prévia disponível</span>
    </div>
  );
}

export default function DocumentosDaPastaPage({ params }: { params: Promise<{ pastaId: string }> }) {
  const { pastaId } = use(params);
  const { user, isAdmin } = useAuth();
  
  const [nomeDoc, setNomeDoc] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [pastaNome, setPastaNome] = useState<string>('Carregando...');
  const [loadingList, setLoadingList] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Busca o nome da pasta
    const unsubPasta = onSnapshot(doc(db, 'atas_pastas', pastaId), (snapshot) => {
      if (snapshot.exists()) {
        setPastaNome((snapshot.data() as Pasta).nome);
      } else {
        setPastaNome('Pasta não encontrada');
      }
    });

    // Busca os documentos da pasta
    const q = query(collection(db, 'atas_documentos'), where('pastaId', '==', pastaId));
    const unsubDocs = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Documento[];
        
        docs.sort((a, b) => {
          const orderA = a.ordemExibicao ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.ordemExibicao ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;

          const timeA = a.criadoEm?.toDate?.().getTime() ?? 0;
          const timeB = b.criadoEm?.toDate?.().getTime() ?? 0;
          return timeB - timeA;
        });

        setDocumentos(docs);
        setLoadingList(false);
      },
      () => {
        setLoadingList(false);
      }
    );

    return () => {
      unsubPasta();
      unsubDocs();
    };
  }, [pastaId]);

  async function uploadToCloudinary(file: File, idToken: string) {
    const body = new FormData();
    body.append('file', file);
    body.append('folder', `representantes/atas/${pastaId}`);

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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setArquivo(selected);
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!isAdmin) return;

    if (!nomeDoc.trim() || !arquivo || !user) {
      setSubmitState('error');
      setMessage('Informe o nome do documento e selecione um arquivo.');
      return;
    }

    setSubmitState('loading');

    try {
      const idToken = await user.getIdToken();
      const upload = await uploadToCloudinary(arquivo, idToken);

      await addDoc(collection(db, 'atas_documentos'), {
        pastaId,
        nome: nomeDoc.trim(),
        ordemExibicao: Date.now(),
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
      setMessage('Documento salvo com sucesso.');
      setNomeDoc('');
      setArquivo(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch {
      setSubmitState('error');
      setMessage('Não foi possível enviar o documento.');
    }
  };

  const handleSetOrder = async (itemId: string, rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setSubmitState('error');
      setMessage('Ordem inválida. Use número inteiro maior que zero.');
      return;
    }

    try {
      await updateDoc(doc(db, 'atas_documentos', itemId), {
        ordemExibicao: parsed,
        atualizadoEm: serverTimestamp(),
      });
    } catch {
      setSubmitState('error');
      setMessage('Não foi possível atualizar a ordem agora.');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <Link href="/dashboard/atas-abertas" className={styles.backButton} aria-label="Voltar para pastas">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </Link>
        <h1 className={styles.pageTitle}>{pastaNome}</h1>
      </div>

      {(isAdmin || message) && (
        <section className={styles.topCard}>
          {isAdmin && (
            <form className={styles.form} onSubmit={handleUpload}>
              <div className={styles.field}>
                <label htmlFor="nomeDoc" className={styles.label}>Nome do documento</label>
                <input
                  id="nomeDoc"
                  className={styles.input}
                  type="text"
                  value={nomeDoc}
                  onChange={(event) => setNomeDoc(event.target.value)}
                  placeholder="Ex.: Ata da Reunião"
                  maxLength={120}
                  disabled={submitState === 'loading'}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="arquivoDoc" className={styles.label}>Arquivo</label>
                <input
                  id="arquivoDoc"
                  ref={fileInputRef}
                  className={styles.fileInput}
                  type="file"
                  onChange={handleFileChange}
                  disabled={submitState === 'loading'}
                />
              </div>

              <button className={styles.submitButton} type="submit" disabled={submitState === 'loading'}>
                {submitState === 'loading' ? 'Enviando...' : 'Fazer Upload'}
              </button>
            </form>
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
      )}

      {loadingList ? (
        <div className={styles.state}>Carregando documentos...</div>
      ) : documentos.length === 0 ? (
        <div className={styles.state}>Nenhum documento encontrado nesta pasta.</div>
      ) : (
        <section className={styles.docList} aria-label="Lista de documentos">
          {documentos.map((doc, index) => (
            <article key={doc.id} className={styles.docItem}>
              <div className={styles.previewWrap}>
                <DocPreview item={doc} />
              </div>
              <div className={styles.docInfo}>
                <h3 className={styles.docTitle}>{doc.nome}</h3>
                <div className={styles.docMeta}>
                  <span>{formatDate(doc.criadoEm?.toDate?.())}</span>
                  <span>•</span>
                  <span>{formatSize(doc.tamanhoBytes)}</span>
                </div>

                {isAdmin && (
                  <div className={styles.orderField}>
                    <label htmlFor={`ordem-doc-${doc.id}`} className={styles.orderLabel}>Ordem</label>
                    <input
                      id={`ordem-doc-${doc.id}`}
                      type="number"
                      min={1}
                      className={styles.orderInput}
                      defaultValue={doc.ordemExibicao ?? index + 1}
                      onBlur={(event) => handleSetOrder(doc.id, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          (event.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                )}

                <a
                  className={styles.downloadButton}
                  href={doc.arquivoUrl}
                  download={doc.arquivoNome}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
