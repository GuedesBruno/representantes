'use client';

import { useState, useId } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import styles from './login.module.css';

function LoginForm() {
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const adminSignupMessage = 'A criação de conta é feita pelo administrador do sistema. Solicite seu acesso.';
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const getErrorMessage = (code: string): string => {
    const messages: Record<string, string> = {
      'auth/invalid-credential': 'E-mail ou senha incorretos. Verifique suas credenciais.',
      'auth/invalid-email': 'E-mail inválido. Confira o formato informado.',
      'auth/user-not-found': 'Usuário não encontrado. Solicite criação de acesso ao administrador.',
      'auth/wrong-password': 'Senha incorreta. Tente novamente.',
      'auth/invalid-api-key': 'Configuração do Firebase inválida (API Key). Verifique as variáveis do projeto.',
      'auth/operation-not-allowed': 'Provedor de login desabilitado no Firebase Authentication.',
      'auth/popup-closed-by-user': 'Login com Google cancelado antes da conclusão.',
      'session/create-failed': 'Login autenticou no Firebase, mas a sessão da aplicação não foi criada. Tente novamente.',
      'auth/user-disabled': 'Esta conta foi desativada. Entre em contato com o suporte.',
      'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      'auth/network-request-failed': 'Falha de conexão. Verifique sua internet.',
    };
    return messages[code] ?? 'Ocorreu um erro. Tente novamente.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      setError(adminSignupMessage);
      return;
    }

    if (!email.trim() || !password) {
      setError('Preencha o e-mail e a senha.');
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      const from = searchParams.get('from') || '/dashboard/folhetos';
      router.push(from);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      setError(getErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
      const from = searchParams.get('from') || '/dashboard/folhetos';
      router.push(from);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      setError(getErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.brandBlock} aria-label="Identidade do portal">
        <Image
          className={styles.brandLogo}
          src="/logo_teca.png"
          alt="Logo Tecassistiva"
          width={72}
          height={72}
          priority
        />
        <h1 className={styles.brandTitle}>Tecassistiva</h1>
        <p className={styles.brandSubtitle}>Portal de Representantes</p>
        <p className={styles.brandCaption}>Acesse projetos, oportunidades e inteligencia comercial</p>
      </section>

      <div className={styles.card}>
        <div className={styles.tabs} role="tablist" aria-label="Modo de acesso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`${styles.tabButton} ${mode === 'login' ? styles.tabButtonActive : ''}`}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`${styles.tabButton} ${mode === 'signup' ? styles.tabButtonActive : ''}`}
            onClick={() => {
              setMode('signup');
              setError(adminSignupMessage);
            }}
          >
            Criar Conta
          </button>
        </div>

        <div className={styles.cardBody}>
          <p className={styles.subtitle}>
            {mode === 'login'
              ? 'Entre com sua conta para acessar o portal.'
              : 'Solicite ao administrador a criação da sua conta de representante.'}
          </p>

          {error && (
            <div
              id={errorId}
              className={styles.globalError}
              role="alert"
              aria-live="assertive"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="16" r="1" fill="currentColor"/>
              </svg>
              {error}
            </div>
          )}

          <form
            className={styles.form}
            onSubmit={handleSubmit}
            noValidate
            aria-describedby={error ? errorId : undefined}
          >
            <div className={styles.field}>
              <label htmlFor={emailId} className={styles.label}>E-mail</label>
              <div className={styles.inputWrapper}>
                <input
                  id={emailId}
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@tecassistiva.com.br"
                  autoComplete="email"
                  required
                  aria-required="true"
                  disabled={loading}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor={passwordId} className={styles.label}>Senha</label>
              <div className={styles.inputWrapper}>
                <input
                  id={passwordId}
                  type="password"
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  required
                  aria-required="true"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              className={styles.button}
              disabled={loading || mode === 'signup'}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  Entrando...
                </>
              ) : mode === 'login' ? 'Entrar' : 'Solicite ao Administrador'}
            </button>
          </form>

          <div className={styles.separator} aria-hidden="true">
            <span />
            <p>Ou</p>
            <span />
          </div>

          <button
            type="button"
            className={styles.googleButton}
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <span className={styles.googleBadge} aria-hidden="true">G</span>
            {loading ? 'Conectando...' : 'Entrar com Google'}
          </button>
        </div>

        <footer className={styles.footer}>
          <p className={styles.footerText}>
            Tecassistiva - Portal de Representantes
          </p>
        </footer>
      </div>

      <p className={styles.copyright}>© 2026 Tecassistiva</p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
