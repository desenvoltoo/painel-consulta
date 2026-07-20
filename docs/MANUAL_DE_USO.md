<p align="center">
  <img src="../apps/web/public/brand-logo.svg" alt="Logo do Painel de Consultas" width="88" />
</p>

# Manual rápido — Painel de Consultas

> Guia visual para operadores e administradores.

## 1. Acesso

1. Abra o endereço do painel.
2. Informe seu e-mail e senha.
3. Clique em **Entrar**.
4. No primeiro acesso, crie uma nova senha.

O logotipo também aparece na tela de login, no menu lateral e na aba do navegador.

---

## 2. Menu principal

| Área | Para que serve |
|---|---|
| **Nova consulta** | Fazer uma consulta individual. |
| **Consulta em lote** | Consultar vários valores do mesmo tipo. |
| **Histórico** | Abrir, pesquisar e filtrar consultas antigas. |
| **Exportações** | Baixar resultados em CSV ou Excel. |
| **Administração** | Gerenciar usuários, filas, falhas e auditoria. |

---

## 3. Consulta individual

```text
Escolha o tipo → Digite o dado → Buscar → Aguarde → Veja o resultado
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
Botão: Buscar Celular
```

> Confira o valor antes de enviar. Uma informação incorreta gera uma consulta incorreta.

---

## 4. Resultado da consulta

Os dados aparecem em cartões organizados.

```text
Nome       JOÃO DA SILVA       [Copiar]
CPF        000.000.000-00      [Copiar]
Telefone   (11) 99999-9999     [Copiar]
```

Ações disponíveis:

- **Copiar:** copia somente o campo selecionado.
- **Copiar tudo:** copia a resposta completa.
- **TXT:** baixa o resultado em texto.
- **CSV:** baixa para planilha.
- **Excel:** baixa em formato XLSX.
- **Ver resposta original:** mostra exatamente o que o bot enviou.

Listas numeradas de empresas são somente para leitura e não iniciam outra consulta.

---

## 5. Consulta em lote

Use esta área para consultar vários CPFs, celulares, CNPJs ou outros valores do mesmo tipo.

### Como preencher

Digite um valor por linha:

```text
11999999999
11888888888
11777777777
```

Depois clique em **Iniciar lote**.

### Tela de resultados do lote

Todos os dados ficam na mesma tela.

- A primeira aba é **Consultados**.
- Ela mostra todos os valores enviados e seus status.
- Cada consulta vira uma aba na parte inferior.
- A aba mostra o valor consultado, como CPF, telefone ou CNPJ.
- Clique em uma aba para abrir as informações daquela consulta.
- A área de informações possui scroll próprio.
- O cabeçalho e as abas permanecem visíveis durante a navegação.

### Cores dos status

| Cor | Status |
|---|---|
| Verde | Concluída |
| Azul | Processando |
| Amarelo | Aguardando |
| Vermelho | Falhou |
| Cinza | Cancelada |

---

## 6. Delay do lote

O bot do Telegram bloqueia comandos enviados rapidamente. Por isso, o painel respeita um intervalo entre os itens.

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

Um lote com 10 itens possui 9 intervalos:

```text
9 × 12 segundos = aproximadamente 108 segundos
```

Esse cálculo não inclui o tempo de resposta do bot.

Quando aparecer:

```text
Você está consultando rápido demais, aguarde alguns segundos e tente novamente.
```

O sistema:

1. identifica a mensagem;
2. espera o período de segurança;
3. coloca a consulta novamente na fila;
4. tenta novamente;
5. envia para falhas somente se todas as tentativas acabarem.

> Não clique várias vezes em **Buscar** ou **Iniciar lote**. Aguarde o processamento.

---

## 7. Exportar o lote

Clique em **Exportar lote em planilha**.

O arquivo é gerado em `.xlsx` e contém:

- aba **Consultados** com todos os valores do lote;
- uma aba para cada consulta;
- tipo da consulta;
- valor consultado;
- status;
- usuário;
- data e tempo;
- campos identificados;
- resposta original.

Os nomes das abas são ajustados automaticamente para funcionar no Excel.

---

## 8. Acompanhamento do lote

A tela mostra:

- percentual concluído;
- consultas concluídas;
- falhas;
- itens aguardando;
- status de cada consulta.

| Status técnico | Significado |
|---|---|
| `QUEUED` | Aguardando na fila. |
| `PROCESSING` | Em processamento. |
| `COMPLETED` | Concluída. |
| `FAILED` | Falhou após as tentativas. |
| `CANCELLED` | Cancelada. |

---

## 9. Arquivos enviados pelo bot

Quando o Telegram enviar PDF, CSV, TXT, JSON ou outro arquivo, ele aparecerá abaixo do resultado.

Clique em **Baixar arquivo**.

O painel gera um link seguro e temporário antes de cada download.

---

## 10. Histórico

No histórico é possível:

- buscar por comando, usuário, e-mail ou conteúdo;
- filtrar por status;
- filtrar por usuário;
- abrir resultados antigos;
- baixar novamente arquivos disponíveis;
- visualizar concluídas, falhas e tempo médio.

Operadores visualizam somente suas consultas. Administradores visualizam todas.

---

## 11. Exportações gerais

Na área **Exportações**:

- **CSV:** arquivo para planilhas e importações;
- **Excel:** arquivo XLSX com o histórico concluído.

A exportação inclui consulta, status, usuário, data, tempo e resposta original.

---

## 12. Administração

Disponível somente para `ADMIN`.

### Usuários

O administrador pode:

- criar usuário;
- selecionar `OPERADOR` ou `ADMIN`;
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
- consulta atual;
- fila de falhas.

Ações:

- **Reprocessar:** devolve uma consulta com erro para a fila.
- **Limpar falhas:** apaga toda a fila de falhas.

> Analise os erros antes de limpar a fila.

### Auditoria

A auditoria registra ações administrativas, usuário, rota, status, data e duração.

Também é possível exportar os registros em JSON.

---

## 13. Problemas comuns

| Problema | O que fazer |
|---|---|
| Senha inválida | Confira e-mail, senha e Caps Lock. |
| Sessão expirada | Entre novamente. |
| Worker offline | Verifique `consulta-worker` no EasyPanel. |
| Consulta parada | Confira worker, Redis e fila. |
| Bot bloqueou por velocidade | Aguarde; o sistema tentará novamente. |
| Arquivo não baixa | Abra novamente o resultado e clique em baixar. |
| Aba do lote não atualiza | Clique em **Atualizar** e aguarde alguns segundos. |
| Scroll não aparece | Atualize a página com `Ctrl + Shift + R`. |
| Logo ou ícone antigo | Limpe o cache com `Ctrl + Shift + R`. |
| Tela antiga após deploy | Pressione `Ctrl + Shift + R`. |

---

## Checklist do operador

- [ ] Escolhi o tipo correto.
- [ ] Conferi o dado antes de enviar.
- [ ] No lote, coloquei um valor por linha.
- [ ] Aguardei o delay sem clicar novamente.
- [ ] Consultei a aba **Consultados**.
- [ ] Abri as abas individuais quando necessário.
- [ ] Exportei o lote quando necessário.
- [ ] Conferi a resposta original.
- [ ] Saí do painel ao terminar.

## Checklist do administrador

- [ ] API, Redis e worker estão online.
- [ ] Usuários aparecem corretamente.
- [ ] A fila está processando normalmente.
- [ ] As falhas foram analisadas antes da limpeza.
- [ ] O domínio de arquivos responde em `/health`.
- [ ] A auditoria está registrando as ações.
- [ ] O delay do Telegram está configurado.

---

**Uso interno — Grupo Referência**
