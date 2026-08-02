# Quiz AD0-E727

Quiz web minimalista (estilo Duolingo) pra responder as questões de estudo geradas para a certificação Adobe Commerce Front-End Developer Expert (AD0-E727). Conecta direto no Supabase, sem backend próprio.

## Como funciona

1. Abra a página e informe a URL e a chave (anon/publishable) do seu projeto Supabase — nada é salvo, fica só na memória da aba.
2. Escolha as categorias e quantas questões quer responder.
3. Responda o quiz: feedback imediato a cada questão, com explicação.
4. Veja o placar final, o desempenho por categoria e a revisão completa das respostas.

Cada resposta é gravada na tabela `tentativas` do seu Supabase, com um número de simulado aleatório — os mesmos dados usados pelo notebook de geração de questões.

## Rodar localmente

Não precisa de build nem de servidor especial. Basta abrir `index.html` no navegador, ou servir a pasta com qualquer servidor estático:

```bash
npx serve .
```

## Deploy no Cloudflare Pages

1. Crie um repositório no GitHub e suba estes arquivos (veja seção abaixo)
2. No painel da Cloudflare, vá em **Workers & Pages > Create > Pages > Connect to Git**
3. Selecione o repositório
4. Configuração de build: **deixe tudo em branco** (não há build step — é HTML/CSS/JS puro)
   - Build command: *(vazio)*
   - Build output directory: `/`
5. Deploy

## Subir para o GitHub

```bash
cd quiz-app
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git branch -M main
git push -u origin main
```

(Troque a URL pelo repositório que você criar na sua conta.)

## Estrutura

```
quiz-app/
├── index.html    # estrutura das 4 telas (conexão, config, quiz, resultados), com diretivas Alpine.js
├── styles.css    # paleta, tipografia e o botão 3D estilo Duolingo
├── app.js        # componente Alpine.js (Alpine.data): conexão Supabase, filtros, quiz, resultados
└── README.md
```

## Stack

HTML + Tailwind CSS (CDN) + [Alpine.js](https://alpinejs.dev/) (CDN) + supabase-js — tudo via CDN, sem build step. Alpine cuida da reatividade (mostrar/esconder telas, listas de opções, chips de categoria) sem manipulação manual de DOM.

## Segurança

A chave do Supabase é digitada pelo usuário a cada sessão e nunca é persistida (sem localStorage, sem cookies). Se o projeto Supabase não tiver Row Level Security (RLS) habilitado, qualquer pessoa com a chave anon/publishable consegue ler as questões e gravar tentativas — considere habilitar RLS com políticas apropriadas se for expor a página publicamente por muito tempo.
