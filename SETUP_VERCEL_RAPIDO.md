# 🚀 Setup Rápido Vercel + Resend

## Resumo Executivo

Você precisa colocar **11 variáveis de ambiente** no Vercel para fazer o app funcionar completamente, incluindo a chave Resend para envio de emails.

## 📋 Checklist: O que você precisa ter

- [ ] **GitHub:** Projeto no GitHub (conectado ao Vercel)
- [ ] **Vercel:** Conta criada em https://vercel.com
- [ ] **Resend:** Chave API gerada (começa com `re_`)
- [ ] **Firebase:** Credenciais do projeto
- [ ] **Cloudinary:** Credenciais de upload
- [ ] **SESSION_SECRET:** Gerar com comando abaixo

## 🔑 Gerar SESSION_SECRET

Cole isto no seu terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie o resultado (vai parecer com: `a3f9c8d2e...`)

## ✅ Instruções Vercel (5 minutos)

### 1. Conectar ao GitHub
- Vá em https://vercel.com/new
- Selecione seu repositório do projeto
- Clique **Import**

### 2. Configurar Variáveis (copiar e colar estas 11)

Na tela de Environment Variables, adicione:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=representantes-tecassistiva
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

SESSION_SECRET=[Cole aqui o resultado do comando acima]

FIREBASE_SERVICE_ACCOUNT_KEY=[JSON completo em UMA LINHA]
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

RESEND_API_KEY=re_[sua chave aqui]
```

### 3. Deploy!

Clique **"Deploy"** e aguarde (2-5 minutos).

## ✨ Resultado

- URL pública gerada automaticamente
- HTTPS habilitado
- Redeploy automático a cada push no GitHub
- Emails funcionando quando representante solicita cotação

## 🐛 Se der erro

**"auth/invalid-api-key"**
→ Verifique NEXT_PUBLIC_FIREBASE_API_KEY

**Emails não chegam**
→ Verifique RESEND_API_KEY no Vercel

**"Permission denied" no Firebase**
→ FIREBASE_SERVICE_ACCOUNT_KEY precisa estar numa linha só (sem quebras)

## 📚 Documentação Completa

Ver arquivo: **VERCEL_DEPLOY.md**
