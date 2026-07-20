# Painel de Consulta

Painel web privado para centralizar consultas realizadas por comandos em um grupo do Telegram.

## Objetivo

O usuário informa um comando, o backend encaminha exatamente o texto ao Telegram, aguarda a resposta correspondente e devolve o conteúdo sem reorganizar, interpretar ou alterar os dados.

O sistema também deverá:

- exibir respostas textuais completas com rolagem;
- disponibilizar arquivos `.txt` retornados pelo Telegram;
- permitir exportação para Excel com data e horário da consulta;
- manter autenticação, autorização e auditoria das consultas;
- operar no domínio `consulta.gruporeferencia.tech`.

## Arquitetura planejada

```text
Navegador
   |
   v
Frontend web
   |
   v
API privada
   |
   +--> Banco PostgreSQL
   |
   +--> Worker Telegram
             |
             v
       Grupo do Telegram
```

## Stack inicial

- Frontend: React + TypeScript
- Backend/API: FastAPI + Python
- Integração Telegram: Telethon
- Banco: PostgreSQL
- Fila/estado temporário: Redis
- Exportação: OpenPyXL
- Infraestrutura: Docker Compose / EasyPanel

## Estrutura

```text
apps/
  api/          API e regras de negócio
  web/          interface do painel
  worker/       integração assíncrona com Telegram
docs/           requisitos, arquitetura e segurança
infra/          arquivos de implantação
```

## Segurança

Este projeto lida com dados pessoais e não deve ser publicado sem:

- login obrigatório;
- perfis e permissões;
- registro de auditoria;
- limites de uso;
- proteção das credenciais do Telegram;
- política de retenção e descarte;
- HTTPS no ambiente de produção.

## Status

Estrutura e requisitos iniciais em preparação.
