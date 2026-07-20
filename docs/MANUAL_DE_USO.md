# Manual rápido — Painel de Consultas

> Guia de uso para operadores e administradores.

## 1. Menu principal

| Área | Para que serve |
|---|---|
| **Nova consulta** | Fazer uma consulta individual. |
| **Consulta em lote** | Consultar vários valores do mesmo tipo. |
| **Histórico** | Abrir e filtrar consultas anteriores. |
| **Exportações** | Baixar resultados em CSV ou Excel. |
| **Administração** | Gerenciar usuários, filas, falhas e auditoria. |

---

## 2. Consulta individual

```text
Escolha o tipo → Digite o dado → Clique em Buscar → Aguarde → Veja o resultado
```

Tipos disponíveis:

- CPF
- Celular
- E-mail
- Placa
- Nome completo
- CEP
- CBO
- Profissão
- Empresa
- CNPJ

### Exemplo

```text
Tipo: Celular
Valor: (11) 99999-9999
Ação: Buscar celular
```

> Confira o valor antes de enviar. Um número incorreto produz uma consulta incorreta.

---

## 3. Resultado da consulta

O resultado pode aparecer em cartões organizados.

```text
Nome       JOÃO DA SILVA       [Copiar]
CPF        000.000.000-00      [Copiar]
Telefone   (11) 99999-9999     [Copiar]
```

Ações disponíveis:

- **Copiar:** copia somente um campo.
- **Copiar tudo:** copia a resposta completa.
- **TXT:** baixa o resultado em texto.
- **CSV:** baixa para planilha.
- **Excel:** baixa em formato XLSX.
- **Ver resposta original:** mostra exatamente o conteúdo enviado pelo bot.

Listas numeradas de empresas são somente para leitura e não iniciam outra consulta.

---

## 4. Consulta em lote

Use esta opção para consultar vários valores do mesmo tipo.

### Como preencher

```text
11999999999
11888888888
11777777777
```

Coloque **um valor por linha** e clique em **Iniciar lote**.

### Delay entre consultas

O bot do Telegram bloqueia comandos enviados rapidamente. Por isso, o worker respeita um intervalo entre cada item do lote.

```text
Consulta 1 ── 12 segundos ── Consulta 2 ── 12 segundos ── Consulta 3
```

Configuração padrão:

| Regra | Funcionamento |
|---|---|
| **12 segundos** | Intervalo normal entre consultas. |
| **20 segundos** | Espera adicional quando o bot informa que está rápido demais. |
| **Até 3 tentativas** | A consulta volta para a fila e é reenviada automaticamente. |

### Exemplo de duração

Um lote com 10 itens possui 9 intervalos entre os comandos:

```text
9 × 12 segundos = aproximadamente 108 segundos
```

Esse tempo não inclui o tempo que o bot leva para responder.

### Mensagem de velocidade

Quando o bot responder:

```text
Você está consultando rápido demais, aguarde alguns segundos e tente novamente.
```

O sistema faz automaticamente:

1. identifica a mensagem;
2. espera o período de segurança;
3. coloca a consulta novamente na fila;
4. tenta outra vez;
5. envia para a fila de falhas somente se todas as tentativas acabarem.

> Não clique várias vezes em **Iniciar lote** ou **Buscar**. Aguarde o processamento.

---

## 5. Acompanhamento do lote

A tela mostra:

- percentual concluído;
- consultas concluídas;
- consultas com falha;
- itens aguardando na fila;
- status de cada consulta.

Status mais comuns:

| Status | Significado |
|---|---|
| `QUEUED` | Aguardando na fila. |
| `PROCESSING` | Em processamento. |
| `COMPLETED` | Concluída. |
| `FAILED` | Falhou após as tentativas. |
| `CANCELLED` | Cancelada. |

---

## 6. Arquivos enviados pelo bot

Quando o Telegram enviar PDF, CSV, TXT, JSON ou outro arquivo, ele aparecerá abaixo do resultado.

Clique em **Baixar arquivo**.

O painel gera um link novo e temporário antes de cada download.

---

## 7. Histórico

No histórico é possível:

- buscar por comando, usuário, e-mail ou conteúdo;
- filtrar por status;
- filtrar por usuário;
- abrir resultados antigos;
- baixar novamente arquivos disponíveis;
- visualizar quantidade concluída, falhas e tempo médio.

Operadores visualizam apenas suas consultas. Administradores visualizam todas.

---

## 8. Exportações

Na área **Exportações**:

- **CSV:** arquivo para planilhas e importações;
- **Excel:** arquivo XLSX com o histórico concluído.

A exportação inclui consulta, status, usuário, data, tempo e resposta original.

---

## 9. Administração

Disponível somente para `ADMIN`.

### Usuários

O administrador pode:

- criar usuário;
- escolher `OPERADOR` ou `ADMIN`;
- bloquear e desbloquear;
- alterar perfil;
- redefinir senha.

A senha redefinida é temporária e deverá ser trocada no próximo acesso.

### Operação e falhas

A área mostra:

- API;
- Redis;
- worker;
- fila aguardando;
- consulta em processamento;
- fila de falhas.

Ações:

- **Reprocessar:** devolve uma consulta com erro para a fila.
- **Limpar falhas:** apaga toda a fila de falhas.

> Analise os erros antes de limpar a fila. Depois da limpeza, os itens não poderão ser reprocessados pela tela.

### Auditoria

A auditoria registra ações administrativas, usuário, rota, status, data e duração.

Também é possível exportar os registros em JSON.

---

## 10. Problemas comuns

| Problema | O que fazer |
|---|---|
| Senha inválida | Confira e-mail, senha e Caps Lock. |
| Sessão expirada | Entre novamente. |
| Worker offline | Verifique `consulta-worker` no EasyPanel. |
| Consulta parada | Confira worker, Redis e fila. |
| Bot bloqueou por velocidade | Aguarde; o sistema tentará novamente. |
| Arquivo não baixa | Abra novamente o resultado e clique em baixar. |
| Tela antiga após deploy | Pressione `Ctrl + Shift + R`. |

---

## Checklist do operador

- [ ] Escolhi o tipo correto.
- [ ] Conferi o dado antes de enviar.
- [ ] No lote, coloquei um valor por linha.
- [ ] Aguardei o delay sem clicar novamente.
- [ ] Conferi a resposta original quando necessário.
- [ ] Saí do painel ao terminar.

## Checklist do administrador

- [ ] API, Redis e worker estão online.
- [ ] Usuários aparecem corretamente.
- [ ] A fila está processando normalmente.
- [ ] As falhas foram analisadas antes da limpeza.
- [ ] O domínio de arquivos responde em `/health`.
- [ ] A auditoria está registrando as ações.

---

**Uso interno — Grupo Referência**
