# Como trocar o logotipo da Pro Accounting

O logo atual é **provisório**. Ele está isolado em dois arquivos e é consumido em um único
componente (`src/components/brand/Logo.tsx`). Nenhuma tela importa os arquivos diretamente.

## Os dois arquivos

| Arquivo          | Proporção  | Onde aparece                                                        |
| ---------------- | ---------- | ------------------------------------------------------------------- |
| `logo.svg`       | horizontal | Tela de login, topo do menu lateral expandido, cabeçalho de relatórios |
| `logo-mark.svg`  | quadrado   | Menu lateral recolhido, favicon, avatar padrão, telas estreitas       |

## Troca (caso 1) — você tem o logo em SVG

O mais simples e o de melhor qualidade. Substitua os dois arquivos **mantendo exatamente os mesmos nomes**:

```
apps/web/src/assets/logo.svg        <- sua versão horizontal (marca + nome)
apps/web/src/assets/logo-mark.svg   <- só o símbolo, recortado em um quadrado
```

Nada mais precisa ser alterado. Recomendações para o SVG:

- Deixe o `viewBox` justo ao desenho, sem margem sobrando (a margem vira espaço morto no menu).
- Não fixe `width`/`height` em pixels — ou, se fixar, mantenha a proporção; o componente redimensiona.
- Converta os textos em curvas/`<path>` se o logo usar uma fonte própria, senão ela não será
  renderizada na máquina de quem abrir o sistema.

## Troca (caso 2) — você só tem PNG/JPG

Coloque os arquivos na mesma pasta e ajuste **apenas as duas linhas de import** no topo de
`src/components/brand/Logo.tsx`:

```diff
- import logoFull from '@/assets/logo.svg'
- import logoMark from '@/assets/logo-mark.svg'
+ import logoFull from '@/assets/logo.png'
+ import logoMark from '@/assets/logo-mark.png'
```

Use PNG com fundo transparente e pelo menos 3x o tamanho de exibição (ex.: 720px de largura na
versão horizontal) para não serrilhar em telas de alta densidade.

## Favicon

O favicon é gerado a partir do `logo-mark.svg` e está referenciado em `apps/web/index.html`.
Se você trocar por PNG, atualize também a linha:

```html
<link rel="icon" type="image/svg+xml" href="/src/assets/logo-mark.svg" />
```

## Cores da interface

As cores do sistema **não** vêm do arquivo do logo — elas ficam centralizadas em
`apps/web/tailwind.config.js` (paleta `brand` = azul corporativo, `accent` = âmbar).
Quando você enviar o logo oficial, me avise: eu ajusto essa paleta para os tons exatos dele,
verificando o contraste (WCAG AA) de cada combinação de texto/fundo.
