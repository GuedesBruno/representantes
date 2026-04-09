# Portal de Representantes Tecassistiva

Portal interno para representantes e equipe administrativa, com autenticação Firebase, gestão de conteúdos (folhetos, documentos, vídeos, produtos), projetos-modelo e solicitações de orçamento.

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Firebase Auth + Firestore
- Cloudinary para upload e entrega de arquivos
- Resend para envio de e-mails

## Pré-requisitos

- Node.js 20+
- npm 10+
- Projeto Firebase com Authentication e Firestore habilitados
- Conta Cloudinary
- Conta Resend (opcional, mas recomendada)

## Configuração de ambiente

Crie um arquivo `.env.local` na raiz com:

```env
# Firebase Web SDK
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (JSON em linha única)
FIREBASE_SERVICE_ACCOUNT_KEY={...}

# Sessão JWT da aplicação
SESSION_SECRET=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# E-mail (opcional)
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

## Instalação

```bash
npm install
```

## Executar localmente

```bash
npm run dev
```

Abra `http://localhost:3000`.

## Build de produção

```bash
npm run build
npm run start
```

## Publicar regras do Firestore

Sempre que alterar `firestore.rules`:

```bash
firebase deploy --only firestore:rules
```

## Tornar um usuário admin

Use o script auxiliar:

```bash
npm run set-admin -- email@dominio.com true
```

Para remover admin:

```bash
npm run set-admin -- email@dominio.com false
```

## Passo a passo de uso do sistema

## 1. Login

1. Acesse `/login`.
2. Entre com e-mail/senha ou Google.
3. Após login, o usuário cai em `/dashboard` (tela de opções).

## 2. Fluxo do representante

1. Em `/dashboard`, escolha o módulo desejado.
2. Consulte e baixe conteúdos em:
	- Folhetos
	- Tabela de Preços
	- Documentos
3. Consulte vídeos e produtos nas abas correspondentes.
4. Em Projetos, monte estrutura/investimento e solicite orçamento.

## 3. Fluxo do admin

1. Acesse o bloco `Admin` no menu lateral.
2. Em `Produtos Modelos`:
	- crie/edite produtos
	- defina `Ordem de Exibição` (impacta Produtos e Vídeos)
	- importe CSV/XLS/XLSX
3. Em `Usuários`:
	- convide usuários
	- altere perfil/role
4. Em `Folhetos` e `Documentos`:
	- suba arquivos
	- ajuste o campo `Ordem` para definir exibição (1 primeiro, 2 segundo...)

## Regras de ordenação de conteúdo

- Folhetos: usa `ordemExibicao` no documento da coleção `folhetos`.
- Documentos: usa `ordemExibicao` no documento da coleção `documentos`.
- Produtos: usa `ordemExibicao` em `produtos_modelos`.
- Vídeos: herda a ordem de `produtos_modelos` (somente itens com `videoUrl`).

## Fluxos de senha

- Convite de usuário e "esqueci minha senha" usam fluxo customizado em português.
- Página de criação/redefinição: `/login/criar-senha`.

## Estrutura principal

- `src/app/dashboard/*`: páginas do portal
- `src/app/api/*`: rotas server-side
- `src/lib/*`: integrações Firebase/Cloudinary/sessão
- `firestore.rules`: autorização do Firestore

## Observações operacionais

- Não suba arquivos de chave do Firebase Admin no git.
- Garantir `SESSION_SECRET` forte em produção.
- Em caso de erro de permissão, confirmar deploy das rules e claims de admin.
