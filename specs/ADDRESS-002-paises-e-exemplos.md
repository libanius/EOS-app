# SPEC — ADDRESS-002: Todos os países e exemplos inventados no endereço
Version: 1.0 | Status: **Done** (pedido direto do dono no chat em 2026-11-16) | Author: Paulo Neto

> Regra 1: nenhum código antes de Ready. Este spec está **Ready**.
> Regra 5: critérios binários.

---

## 1. Objetivo

1. O campo **País** do endereço da casa (`components/HomeAddress.tsx`) lista
   **todos os países** (ISO-3166 alpha-2), não só EUA e Brasil.
2. Os placeholders do formulário **não mostram o endereço real do dono**
   (rua, unidade, cidade e ZIP da casa dele apareciam para todos os usuários).
   Passam a ser exemplos inventados, coerentes com o país escolhido.

## 2. Comportamento

- A lista abre com **Estados Unidos** e **Brasil** no topo (os dois países
  atendidos com formato próprio), depois um separador, depois todos os outros
  países em ordem alfabética no idioma da tela.
- Nome do país no idioma da tela (pt-BR / en), gerado por `Intl.DisplayNames`.
- EUA e Brasil mantêm rótulos, lista de estados e formatação próprios.
- Os demais países usam rótulos genéricos (Endereço / Complemento / Cidade /
  Estado ou província / Código postal) e região em campo livre.
- Placeholders por país:
  - EUA: `123 Main St` · `Apt 4B` · `Springfield` · `12345`
  - Brasil: `Rua das Flores, 100` · `Apto 12` · `Campinas` · `00000-000`
  - Outros: `Rua Exemplo, 10` / `10 Example Street` · `Apto 1` / `Apt 1` · `Cidade` / `City` · sem placeholder de código postal.
- O campo de código postal só usa teclado numérico nos EUA (o CEP aceita hífen
  e vários países usam letras no código postal).

## 3. Data Contract

Sem mudança: `address.country` continua sendo ISO-3166 alpha-2. Nenhuma
migração. Endereços já salvos com `US` ou `BR` continuam idênticos.

## 4. Regras de Negócio

- Nenhum dado pessoal real em placeholder, exemplo ou texto de ajuda do formulário.
- `formatAddress` mantém a ordem brasileira para `BR` e a americana como fallback para todos os outros.
- Fora do formulário, o endereço comercial nas páginas legais e no rodapé **não** é tocado por este spec (é o endereço da empresa, exigido nos termos).

## 5. Edge cases

- Código salvo que não está na lista (ex.: `XX`): `countryOf` devolve `null`, o formulário mostra só o seletor, nada quebra.
- Navegador sem `Intl.DisplayNames`: cai para o próprio código ISO como nome.

## 6. Critérios de Aceitação

- [x] CA O seletor de país tem mais de 240 opções.
- [x] CA EUA e Brasil são as duas primeiras opções.
- [x] CA `countryOf('PT')`, `countryOf('JP')` devolvem país com rótulos genéricos e sem `regions`.
- [x] CA Nenhum arquivo em `components/` ou `lib/` (fora de testes) contém `Holmberg`, `4124` ou `33067`.
- [x] CA Testes de `lib/__tests__/address.test.ts` passam, incluindo os novos.

## 7. Fora do Escopo

- Formatos de endereço específicos por país além de EUA e Brasil.
- Endereço comercial nas páginas legais, rodapé e README.
- Cobertura de alertas/hazard fora de EUA/Brasil.
