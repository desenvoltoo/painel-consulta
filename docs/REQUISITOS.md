# Requisitos do Painel de Consulta

## 1. Escopo

O sistema automatiza consultas realizadas por comandos existentes em um grupo do Telegram. Ele não substitui o Telegram, não muda a lógica dos comandos e não interpreta os resultados.

## 2. Fluxo principal

1. Usuário autenticado acessa o painel.
2. Digita o comando completo.
3. O sistema valida apenas segurança e permissão, sem reescrever o comando.
4. A consulta entra em processamento.
5. O worker envia exatamente o comando ao grupo configurado.
6. O sistema aguarda uma resposta do bot configurado.
7. A resposta é associada à consulta correta.
8. O resultado é apresentado ao usuário.
9. O usuário pode exportar o retorno para Excel.

## 3. Interface

### Campo de comando

Aceitar comandos completos, por exemplo:

```text
/cpf 068.038.899-04
/email exemplo@gmail.com
/placa ABC1D23
```

### Área de resultado

- mostrar o conteúdo integral recebido;
- preservar quebras de linha;
- possuir rolagem;
- mostrar estados: aguardando, processando, concluído, expirado e erro;
- não reorganizar nem interpretar o texto.

### Pesquisa de comandos

- campo lateral para filtrar comandos cadastrados;
- lista com rolagem;
- seleção de um comando deve apenas preencher ou orientar o campo principal;
- cadastro dos comandos deve ser administrável.

### Arquivos

Quando o Telegram responder com `.txt`:

- baixar e armazenar temporariamente;
- associar o arquivo à consulta;
- disponibilizar download autenticado;
- preservar nome e conteúdo sempre que possível;
- excluir conforme política de retenção.

### Exportação Excel

O arquivo deve conter:

- comando consultado;
- conteúdo integral retornado;
- data e horário do envio;
- data e horário da resposta;
- usuário responsável;
- identificador da consulta.

## 4. Segurança e controle

- autenticação obrigatória;
- perfis `ADMIN` e `OPERADOR`;
- usuário inativo não pode consultar;
- auditoria de login, consulta, exportação e download;
- limite de consultas simultâneas;
- credenciais do Telegram somente no servidor;
- resultados acessíveis somente por usuários autorizados;
- proteção contra enumeração de IDs;
- não registrar segredos nos logs.

## 5. Associação entre comando e resposta

A resposta não deve ser associada apenas por ser a próxima mensagem do grupo. O worker deverá considerar, quando disponível:

- grupo configurado;
- remetente igual ao bot esperado;
- mensagem respondida/reply ao comando enviado;
- ID da mensagem enviada;
- janela de tempo;
- fila de consultas para evitar cruzamento.

A primeira versão operará com uma consulta ativa por sessão do Telegram, salvo comprovação de que o bot responde com correlação segura.

## 6. Domínio de produção

```text
consulta.gruporeferencia.tech
```

O ambiente de produção deverá utilizar HTTPS e não expor diretamente PostgreSQL, Redis ou a sessão do Telegram.
