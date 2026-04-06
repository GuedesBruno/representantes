# Firebase Admin Claims (admin=true)

## 1) Defina a chave de conta de servico
No arquivo `.env.local`, adicione a variavel abaixo com o JSON da conta de servico em linha unica:

```
FIREBASE_SERVICE_ACCOUNT_KEY={...json da service account...}
```

Dica: no Firebase Console > Configuracoes do projeto > Contas de servico > Gerar nova chave privada.

## 2) Marcar usuario como admin
Execute:

```
npm run set-admin -- email@dominio.com true
```

Para remover admin:

```
npm run set-admin -- email@dominio.com false
```

O script revoga refresh tokens. O usuario precisa sair e entrar novamente.

## 3) Publicar regras no Firebase
Firestore Rules: usar arquivo `firestore.rules`
Storage Rules: usar arquivo `storage.rules`

Com Firebase CLI:

```
firebase deploy --only firestore:rules
firebase deploy --only storage
```

## 4) Comportamento no app
- Leitura de folhetos: usuario autenticado
- Cadastro/edicao/exclusao de folhetos: somente `request.auth.token.admin == true`
- A tela de folhetos detecta admin pela claim do token do Firebase (nao por lista de e-mails no frontend)
