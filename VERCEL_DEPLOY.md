# Deploy no Vercel

## Pré-requisitos

1. **GitHub:** Projeto commitado em um repositório GitHub
2. **Vercel Account:** Conta criada em https://vercel.com
3. **Variáveis de Ambiente:** Todas as chaves obtidas e prontas

## Variáveis Obrigatórias para Vercel

### Firebase (Client-side - NEXT_PUBLIC_)
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

### Firebase & Cloudinary (Server-side)
```
FIREBASE_SERVICE_ACCOUNT_KEY    (JSON em linha única)
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

### Session & Email
```
SESSION_SECRET                  (Chave aleatória de 32+ caracteres)
RESEND_API_KEY                  (Sua chave do Resend: re_xxxx)
```

## Passo a Passo: Deploy

### 1. Import no Vercel

1. Acesse [vercel.com/dashboard](https://vercel.com/dashboard)
2. Clique em **"Add New..."** → **"Project"**
3. Selecione o repositório GitHub do projeto
4. Clique em **"Import"**

### 2. Configurar Variáveis de Ambiente

Na tela de configuração do projeto:

1. Role até **"Environment Variables"**
2. Adicione cada variável:

```
NEXT_PUBLIC_FIREBASE_API_KEY          = [Sua chave Firebase]
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN      = [Seu domínio Firebase]
NEXT_PUBLIC_FIREBASE_PROJECT_ID       = [Seu project ID]
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET   = [Seu storage bucket]
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = [Seu sender ID]
NEXT_PUBLIC_FIREBASE_APP_ID           = [Seu app ID]

FIREBASE_SERVICE_ACCOUNT_KEY = [JSON completo em linha única, sem quebras]
SESSION_SECRET               = [Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"]

CLOUDINARY_CLOUD_NAME        = [Seu cloud name]
CLOUDINARY_API_KEY           = [Sua chave API]
CLOUDINARY_API_SECRET        = [Seu secret API]

RESEND_API_KEY               = [Sua chave Resend: re_xxxx]
```

### 3. Gerar SESSION_SECRET

No seu terminal local:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o valor e cole em SESSION_SECRET no Vercel.

### 4. Deployment

1. Clique em **"Deploy"**
2. Aguarde o build completar (normalmente 2-5 minutos)
3. Após sucesso, sua URL estará disponível

## Verificação Pós-Deploy

### ✅ Testes Recomendados

1. **Auth Flow:**
   - Acesse `/login`
   - Faça login com uma conta teste

2. **Dashboard:**
   - Acesse `/dashboard`
   - Verifique se dados carregam corretamente

3. **Upload de Imagem:**
   - Vá para admin de produtos
   - Faça upload de uma imagem
   - Verifique se aparece no Cloudinary

4. **Cotação por Email:**
   - Acesse um projeto
   - Clique em "Solicitar Cotação"
   - Verifique se email foi recebido pelo vendedor

## Variáveis Sensíveis - Boas Práticas

⚠️ **NUNCA commitie as seguintes variáveis:**
- `FIREBASE_SERVICE_ACCOUNT_KEY`
- `SESSION_SECRET`
- `CLOUDINARY_API_SECRET`
- `RESEND_API_KEY`

Essas devem ser configuradas APENAS no Vercel (ou `.env.local` local).

## Troubleshooting

### Build falha com "auth/invalid-api-key"

**Causa:** NEXT_PUBLIC_FIREBASE_API_KEY inválida ou faltando
**Solução:** Verifique se a variável está correta e redeploy

### Emails não chegam

**Causa 1:** RESEND_API_KEY inválida
- Verifique a chave no Vercel
- Regenere uma nova chave no Resend se necessário

**Causa 2:** Domínio não validado
- Se usar domínio customizado, valide no Resend
- Use `onboarding@resend.dev` para testes

### Firebase: Permissão Negada

**Causa:** FIREBASE_SERVICE_ACCOUNT_KEY ou FIREBASE_SERVICE_ACCOUNT_EMAIL não autorizado
**Solução:**
- Verifique se o JSON é válido (sem quebras de linha extras)
- Regenere a chave no Firebase Console

## Próximas Deploys

Após configurado a primeira vez, qualquer push para a branch conectada (main/master) fará deploy automático.

Para configurar branch customizada:
1. Vá ao projeto no Vercel
2. **Settings** → **Git**
3. Configure a branch em **Production Branch**

## Monitoramento

- **Logs:** Vercel Dashboard → Projeto → **Deployments** → **Logs**
- **Erros em Produção:** Verifique a aba **Functions** para erros serverless
- **Performance:** Use **Speed Insights** na Vercel para monitorar

## Redeploy/Revert

### Redeploy última versão
```bash
vercel --prod
```

### Revert para deployment anterior
1. Dashboard Vercel → Projeto
2. **Deployments**
3. Clique em **...** do deployment anterior
4. Selecione **"Promote to Production"**

## Variáveis por Ambiente (Avançado)

Se precisar de variáveis diferentes por ambiente:

1. Vercel Dashboard → Projeto → **Settings** → **Environment Variables**
2. Clique em **"Manage"**
3. Configure por ambiente (Development, Preview, Production)

## Perguntas Frequentes

**P: Posso usar variáveis diferentes por branch?**
R: Sim! Configure no Vercel em Settings → Environment Variables → Preview/Production

**P: Como fazer deploy sem commitar?**
R: Use `vercel --prod` do CLI local (precisa instalar Vercel CLI)

**P: Posso rollback automático se o build falhar?**
R: Não, mas o Vercel não faz deploy se o build falhar, protegendo produção.
