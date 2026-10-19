# Logotipo padrão da Pro Accounting

Os três PNG desta pasta são o logotipo **padrão de fábrica**. Um logotipo enviado em
Configurações → Identidade visual tem precedência sobre eles em todas as telas.
`src/components/brand/Logo.tsx` é o único arquivo que os importa; nenhuma tela os usa
diretamente.

## Trocar o logotipo padrão

1. Substitua os três arquivos mantendo exatamente os mesmos nomes:

   | Arquivo          | O que deve conter                                   | Fundo onde aparece                              |
   | ---------------- | --------------------------------------------------- | ----------------------------------------------- |
   | `logo.png`       | logotipo completo na cor da marca, fundo transparente | claro                                         |
   | `logo-white.png` | o mesmo logotipo todo em branco, fundo transparente | azul-escuro (`brand-900`): menu lateral e painel do login |
   | `logo-mark.png`  | só o símbolo, quadrado                              | aba do navegador (favicon)                      |

   A altura de `logo.png` e `logo-white.png` deve ser pelo menos 3× o maior `size` usado
   com aquela variante (procure `<Logo variant=` em `src/`), para não serrilhar em telas de
   alta densidade. O `logo-mark.png` não tem `size` no código: use ao menos 64×64 px, o
   que o navegador pede para o favicon nessas telas. Pronto quando os três arquivos existem
   com esses nomes e tamanhos.

2. Só se mudar o formato (SVG, JPG, WEBP): troque as três linhas de `import` no topo de
   `Logo.tsx` e os atributos `type` e `href` do `<link rel="icon">` em `frontend/index.html`.
   Pronto quando, a partir de `frontend/`,
   `grep -rn "assets/logo" index.html src --include=*.tsx --include=*.html` só mostra os
   nomes novos. Em SVG, deixe o `viewBox` justo ao desenho (margem vira espaço morto no
   menu) e converta textos em `<path>` (uma fonte própria não existe na máquina de quem abre
   o sistema).

3. Confira: `npm run build --prefix frontend` falha se um import aponta para arquivo
   inexistente. Depois abra `/login` (logo completo no formulário, versão branca no painel
   azul) e veja a aba do navegador. Pronto quando o build passa e as duas telas mostram o
   logo novo; se mostrarem outro, veja o primeiro item abaixo.

## Quando algo não bate

- **A tela continua com outro logo depois da troca:** há um logotipo enviado em
  Configurações → Identidade visual, gravado no banco. Ele substitui os três arquivos;
  remova o envio ali para ver o padrão.
- **Um logo enviado aparece igual nas três variantes**, inclusive sobre o menu azul-escuro,
  porque o envio é de um arquivo só (o motivo está no comentário de `Logo.tsx`). Para o
  menu ficar legível, o logo enviado precisa funcionar sobre fundo escuro.
- **O favicon não acompanha o envio:** `index.html` aponta sempre para `logo-mark.png`.
- **As cores da interface não vêm do arquivo do logo.** A cor primária é escolhida em
  Configurações → Identidade visual, e `src/lib/theme.ts` deriva dela a rampa `brand-*`;
  é ali que se casa a cor com o logo, e a tela avisa quando o contraste com texto branco
  fica abaixo de 4,5:1. A cor de fábrica mora em dois lugares que precisam mudar juntos: o
  `@default` de `primaryColor` em `backend/prisma/schema.prisma` (instalações novas; exige
  migration) e as variáveis `--brand-*` e `--primary` em `src/index.css` (usadas antes de a
  configuração carregar).
