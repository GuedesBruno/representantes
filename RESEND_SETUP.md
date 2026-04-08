# Configuração de Email - Resend

## Visão Geral
O sistema de solicitação de cotação utiliza **Resend** para enviar emails automáticos aos vendedores quando um representante faz uma requisição de projeto.

## Instalação
A biblioteca já foi instalada. Se precisar reinstalar:

```bash
npm install resend
```

## Configuração

### 1. Obter Chave de API Resend
1. Acesse [resend.com](https://resend.com)
2. Crie uma conta/faça login
3. Vá para **Tokens** → **API Keys**
4. Crie uma nova API Key (copie e guarde)

### 2. Adicionar Variável de Ambiente
Crie um arquivo `.env.local` na raiz do projeto (se não existir) e adicione:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
```

Substitua `re_xxxxxxxxxxxxxxxxxxxxxxxx` pela sua chave real.

### 3. Validação de Domínio
Se usar um domínio personalizado (ex: `noreply@tecassistiva.com.br`):
- Confirme o domínio no Resend (DNS records)
- A configuração atual usa `noreply@tecassistiva.com.br`

Para testes iniciais, você pode usar:
```bash
from: 'onboarding@resend.dev'
```

## Fluxo de Cotação

1. Representante clica em **"📧 Solicitar Cotação"** na página de projeto
2. Sistema valida dados e obtém email do vendedor atrelado ao representante
3. Email é enviado para o vendedor com:
   - ID da cotação
   - Nome e descrição do projeto
   - Lista de produtos com quantidades e preços
   - Total do projeto
   - Contato do representante

## Estrutura do Email

```
Header: "Nova Requisição de Cotação"
├── ID da Cotação
├── Detalhes do Projeto
│   ├── Kit/Projeto
│   ├── Representante (email)
│   └── Data
├── Tabela de Produtos
│   ├── Produto | Quantidade | Preço Unitário | Subtotal
│   └── TOTAL
└── Call-to-Action: "Entre em contato com o representante"
```

## Tratamento de Erros

- Se `RESEND_API_KEY` não estiver configurada, um aviso é logado e o email não é enviado
- Se houver erro ao enviar, a requisição falha (status 500)
- Logs são registrados no console/servidor

## Verificação

Para testar se tudo está funcionando:

1. Certifique-se que um representante tem um vendedor atrelado (`users.sales.emailVendedor`)
2. Acesse a página de projeto
3. Clique em "Solicitar Cotação"
4. Verifique se o email foi recebido pelo vendedor
5. Confira os logs do servidor

## Variáveis Necessárias

```
RESEND_API_KEY              Chave de API do Resend (obrigatória para enviar emails)
```

## Próximas Etapas (Opcional)

- [ ] Configurar múltiplos remetentes por região
- [ ] Adicionar templates customizados
- [ ] Implementar webhooks para tracking de entrega
- [ ] Adicionar confirmação de leitura do vendedor
