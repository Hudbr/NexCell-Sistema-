# NexCell — Store, PDV e Control

Sistema integrado da NexCell dividido por responsabilidade:

- **Store (`/`)**: catálogo público, busca, categorias, página individual, carrossel, cores, carrinho e pedido pelo WhatsApp.
- **PDV (`/pdv/`)**: autenticação da equipe, leitura de código/SKU, venda por variação, orçamentos, pagamentos, baixa atômica de estoque e comprovante.
- **Control (`/control/`)**: dashboard administrativo, produtos, cores e estoque, pedidos da Store, vendas, cancelamentos, equipe, permissões e configurações.

## Estrutura

```text
/
├── index.html                 # NexCell Store
├── produto/                   # Página individual do produto
├── pdv/                       # Frente de caixa
├── control/                   # Administração
├── assets/
│   ├── css/                   # Base, Store e área de trabalho
│   └── js/                    # Firebase, utilitários, carrinho e Store
├── firestore.rules            # Segurança do banco
├── firebase.json              # Hosting e regras Firebase
└── .github/workflows/pages.yml
```

## Banco de dados

O projeto utiliza Firebase Authentication e Cloud Firestore. A configuração web do Firebase fica no cliente por definição; a segurança efetiva está em `firestore.rules`.

Coleções principais: `produtos`, `usuarios`, `vendas`, `pedidos` e `configuracoes/geral`.

Antes do uso em produção:

1. Ative os provedores **E-mail/Senha** e **Anônimo** no Firebase Authentication.
2. Publique as regras com `firebase deploy --only firestore:rules`.
3. Garanta que o primeiro usuário possua `cargo: "admin"` e `status: "ativo"` em `usuarios/{uid}`.

## Publicação

O workflow `pages.yml` publica automaticamente a branch `main` no GitHub Pages. O mesmo projeto também pode ser hospedado no Firebase Hosting.
