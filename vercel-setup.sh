#!/bin/bash
# Checklist rápido para deploy no Vercel
# Execute este script ou use como referência

echo "🚀 VERCEL DEPLOY CHECKLIST"
echo "================================"
echo ""

echo "📋 Variáveis Necessárias:"
echo ""
echo "✅ Firebase (Client-side - NEXT_PUBLIC_)"
echo "   □ NEXT_PUBLIC_FIREBASE_API_KEY"
echo "   □ NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
echo "   □ NEXT_PUBLIC_FIREBASE_PROJECT_ID"
echo "   □ NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
echo "   □ NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
echo "   □ NEXT_PUBLIC_FIREBASE_APP_ID"
echo ""

echo "✅ Firebase Admin (Server-side)"
echo "   □ FIREBASE_SERVICE_ACCOUNT_KEY (JSON em linha única)"
echo ""

echo "✅ Session"
echo "   □ SESSION_SECRET (32+ caracteres aleatórios)"
echo "      Gerar: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
echo ""

echo "✅ Cloudinary"
echo "   □ CLOUDINARY_CLOUD_NAME"
echo "   □ CLOUDINARY_API_KEY"
echo "   □ CLOUDINARY_API_SECRET"
echo ""

echo "✅ Resend (Email)"
echo "   □ RESEND_API_KEY (comeca com re_)"
echo ""

echo "================================"
echo "📊 Dados de Referência:"
echo ""
echo "Firebase Project ID: representantes-tecassistiva-firebase-adminsdk-fbsvc-2fd5c950f6"
echo "Cloudinary: [insira seu cloud name]"
echo "Resend: [insira sua chave re_xxxx]"
echo ""

echo "================================"
echo "🔗 Próximos Passos:"
echo ""
echo "1. Acesse https://vercel.com/dashboard"
echo "2. Import do repositório GitHub"
echo "3. Adicione as variáveis acima em Environment Variables"
echo "4. Clique em Deploy"
echo ""
echo "Mais detalhes em: VERCEL_DEPLOY.md"
