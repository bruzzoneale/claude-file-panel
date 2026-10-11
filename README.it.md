# file-panel

[English](README.md) · **Italiano**

Mod per Claude Code: sposta le letture e le modifiche dei file in un pannello laterale, lasciando il
transcript principale a conversazione, ragionamenti e prompt.

- **Pannello "File"**: ogni operazione di Edit, Write, NotebookEdit, Read, Glob e Grep, la più recente in
  alto. Edit e Write mostrano il diff colorato e il conteggio delle righe +/-, gli errori sono in rosso.
  Il pulsante "Clear" azzera l'elenco.
- **Transcript**: la riga di un tool sui file diventa una riga grigia (`✓ Edit Unit1.pas  → File pane`).
  I comandi Bash mantengono il loro output; i file modificati da un comando (uno script, `sed`, ...)
  vanno nel pannello con il loro diff.
- **Pannello chiuso** (Esc o `ctrl+x x`): il transcript torna a mostrare tutto per intero.
- **`/file-panel`** riapre il pannello.

Il pannello è una colonna a destra nel layout a schermo intero del terminale, da 110 colonne in su; si
apre da solo all'avvio da 144 colonne. Nel layout normale (`CLAUDE_CODE_NO_FLICKER=0`, tmux) compare
sopra il prompt.

## Installazione

Da un terminale con Claude Code, al prompt:

```
/plugin install file-panel --marketplace bruzzoneale/claude-file-panel
```

Rispondi `y` ad "Add marketplace?", poi scegli lo scope (Invio per *user*: la mod è attiva in tutte le
sessioni). In alternativa, dalla riga di comando:

```
claude plugin install file-panel --marketplace bruzzoneale/claude-file-panel --scope user
```

Le sessioni già aperte caricano il plugin al prossimo avvio.

## Sviluppo

Dopo aver clonato il repository:

- Provarla senza installarla: `claude --plugin-dir <cartella del clone>`
- Validare: `claude plugin validate <cartella del clone>`
- Test: `claude plugin test <cartella del clone>`

`.claude-plugin/types/` lo scrive il motore al caricamento (tipi per l'editor): non va versionato.
