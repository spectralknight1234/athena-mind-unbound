## Plano

**1. Auto-envio das sugestões de boas-vindas**
- Alterar `Welcome` em `src/routes/index.tsx` para receber um callback `onSend(prompt)` em vez de apenas preencher o input.
- Ao clicar em uma sugestão, chamar `send(prompt)` diretamente, sem exigir um segundo clique no botão de enviar.
- Refatorar `send()` para aceitar um texto opcional (fallback no `input` atual) — assim a sugestão é enviada imediatamente sem depender do estado assíncrono do `setInput`.

**2. Correção do nome "Atena" no cabeçalho**
- O `<span class="text-aurora">` aplica `background-clip: text` + `color: transparent`. Em alguns navegadores/contextos o texto fica invisível ou com fallback estranho.
- Garantir fallback: adicionar `color: var(--aurora-1)` antes de `transparent` e `-webkit-text-fill-color: transparent` para o gradiente funcionar consistentemente em WebKit.
- Aplicar o mesmo fix ao "Atena" da tela de boas-vindas.

**3. Correção do rodapé**
- O texto "Atena pode cometer erros…" está com `text-[11px]` e contraste fraco sobre o glass; em telas pequenas (viewport atual 384px) fica espremido junto ao composer.
- Ajustar espaçamento (`mt-2` → `mt-2.5`), aumentar contraste (`text-muted-foreground/80`) e garantir que o rodapé não sobreponha o teclado em mobile (já é `sticky bottom-0`, mantém).
- Conferir se há overflow horizontal causado pelo header/rodapé na largura mobile.

**Arquivos afetados**
- `src/routes/index.tsx` — auto-send + ajuste do rodapé
- `src/styles.css` — fallback do `.text-aurora`

Se você estava se referindo a outros "erros" específicos (mensagem de erro visível, texto cortado, etc.), me diga o que está vendo que eu ajusto antes de implementar.