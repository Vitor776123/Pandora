# Pandora

Centro de comando pessoal: reuniões em formato de caderno, calendário, tarefas com status,
diário, relatórios mensais, visão de gestão (PDF) e busca global.

Site estático (HTML, CSS e JavaScript puros) + Supabase (login e banco). Sem IA nesta versão.

## O que tem em cada tela

| Tela | Para que serve |
|---|---|
| Hoje | Painel em blocos: agenda do dia com a próxima reunião em destaque, panorama em números, prazos, diário, acesso rápido e avanço dos projetos |
| Calendário | Reuniões e prazos no mês; clique no dia para ver detalhes |
| Reuniões | Caderno com data de hoje, pauta e ações pré-definidas por modelo, pontos numerados, observações, decisões, **responsável** e prazo por ação. **Copiar ata** gera o texto formatado; as setas no canto superior esquerdo folheiam as reuniões anteriores; **Finalizar reunião** registra no calendário e cria as tarefas |
| Tarefas | Quadro com Pendente, Em construção, Feito, Testado e No ar (arraste os cartões) |
| Projetos | Status e avanço de cada projeto, calculado pelas tarefas |
| Diário | O que você fez em cada dia |
| Relatórios | Um por mês, com rascunho gerado a partir dos seus registros |
| Gestão | Três abas: relatório do mês (com **Exportar PDF**), **linha do tempo** das reuniões (clique para ver as anotações) e **links por projeto** |

Atalhos: `Ctrl + K` (`⌘ K` no Mac) abre a paleta: busca em tudo (aceita datas como `20/10`) e executa comandos (nova reunião, nova tarefa, ir para qualquer tela, exportar PDF...), `Alt + N` nova reunião, `Ctrl + J` captura rápida (o botão + no canto inferior direito, em qualquer tela).

## Visual

Superfícies que flutuam (barra superior, menu lateral aberto, paleta, janelas, captura rápida) usam vidro
translúcido com desfoque. Áreas de leitura (caderno, relatórios) ficam sólidas. Quem pede menos transparência
no sistema, ou navegadores sem suporte, recebem fundos sólidos. Os valores ficam nos tokens `--glass-*` do `styles.css`.

## Publicar (GitHub + Vercel)

1. Crie um repositório no GitHub e envie estes arquivos (`index.html`, `app.js`, `styles.css`,
   `config.js`, `vercel.json`, pasta `vendor/`).
2. Na Vercel: **Add New > Project**, escolha o repositório e clique em **Deploy**.
   Não precisa de build nem de variáveis de ambiente (framework: *Other*).
3. Abra o endereço gerado e entre com seu e-mail e senha.

## Segurança (importante)

- A chave em `config.js` é a chave pública (`anon`) do Supabase. Ela pode ficar no GitHub.
  **Nunca** coloque ali a chave `service_role` nem a senha.
- Os dados são protegidos por login e por regras no banco (RLS): somente o e-mail
  `vdomingues@alkes.com.br` consegue ler e gravar. Outra pessoa que se cadastre não vê nada.
- Para reforçar, no painel do Supabase (projeto `command-center`):
  - **Authentication > Sign In / Providers > Email**: desative *Allow new users to sign up*.
  - **Authentication > Password security**: ative *Prevent use of leaked passwords* (se o plano permitir).
- Troque a senha inicial em **Conta** (menu no canto inferior esquerdo) logo no primeiro acesso.
- O repositório pode ser privado: a Vercel publica do mesmo jeito.

## Backup

Em **Conta > Baixar backup (JSON)** você baixa tudo (reuniões, tarefas, diário e relatórios).

## Trocar o nome exibido na Gestão

Edite `OWNER_NAME` em `config.js`.

## Estrutura do banco

Tabelas: `projects`, `meeting_templates`, `meetings`, `tasks` (com `owner`), `diary_entries`, `reports`, `project_links`,
todas com RLS ligada. As migrações já foram aplicadas no projeto Supabase.

## Fase 3 (opcional): resumo com IA

Quando quiser, dá para ligar um provedor com plano gratuito por uma função serverless na Vercel
(a chave da IA fica no servidor, nunca no navegador). Confira a política de dados do provedor
antes de enviar conteúdo de trabalho.
