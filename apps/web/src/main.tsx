import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, Check, Clock3, Command, Copy, Download, FileText, History, LogOut, Search, Send, ShieldCheck, Sparkles, Trash2, UserRound } from 'lucide-react';
import './styles.css';

type QueryStatus = 'idle' | 'loading' | 'success' | 'error';
type ViewName = 'search' | 'history' | 'exports';

type QueryResult = {
  id: string;
  command: string;
  content: string;
  createdAt: string;
  elapsedMs: number;
};

type ParsedField = {
  id: string;
  label: string;
  value: string;
  section: string;
};

const STORAGE_KEY = 'painel-consulta-history-v1';

const availableCommands = [
  { name: '/cpf', description: 'Consulta completa por CPF', example: '/cpf 000.000.000-00' },
  { name: '/numero', description: 'Consulta por telefone', example: '/numero 11999999999' },
  { name: '/email', description: 'Consulta por endereço de e-mail', example: '/email nome@email.com' },
  { name: '/placa', description: 'Consulta de veículo pela placa', example: '/placa ABC1D23' },
  { name: '/nome1', description: 'Pesquisa por nome completo', example: '/nome1 NOME COMPLETO' },
  { name: '/cep1', description: 'Gera arquivo por CEP', example: '/cep1 01001000' },
  { name: '/cbo', description: 'Gera arquivo por CBO', example: '/cbo 212405' },
  { name: '/profissao', description: 'Gera arquivo por profissão', example: '/profissao ANALISTA' },
  { name: '/empresa', description: 'Pesquisa por empresa', example: '/empresa NOME DA EMPRESA' },
  { name: '/cnpj', description: 'Consulta por CNPJ', example: '/cnpj 00000000000000' },
];

function parseFields(content: string): ParsedField[] {
  let section = 'Informações';
  const fields: ParsedField[] = [];

  content.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    if (/^>{1,3}\s*/.test(line) || /^[-=]{3,}$/.test(line)) {
      section = line.replace(/^>{1,3}\s*/, '').replace(/^[-=]+|[-=]+$/g, '').trim() || section;
      return;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) return;

    const label = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!label || !value) return;

    fields.push({
      id: `${index}-${label}`,
      label,
      value,
      section,
    });
  });

  return fields;
}

function downloadText(result: QueryResult) {
  const body = `Comando: ${result.command}\nData: ${new Date(result.createdAt).toLocaleString('pt-BR')}\nTempo: ${(result.elapsedMs / 1000).toFixed(1)}s\n\n${result.content}`;
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `consulta-${result.id}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [view, setView] = useState<ViewName>('search');
  const [command, setCommand] = useState('');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<QueryStatus>('idle');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [history, setHistory] = useState<QueryResult[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
  }, [history]);

  const filteredCommands = useMemo(
    () => availableCommands.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(filter.toLowerCase())),
    [filter],
  );

  const parsedFields = useMemo(() => parseFields(result?.content || ''), [result]);
  const groupedFields = useMemo(() => {
    return parsedFields.reduce<Record<string, ParsedField[]>>((groups, field) => {
      (groups[field.section] ||= []).push(field);
      return groups;
    }, {});
  }, [parsedFields]);

  async function copyValue(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(''), 1400);
  }

  async function runQuery(event: FormEvent) {
    event.preventDefault();
    if (!command.trim() || status === 'loading') return;
    setStatus('loading');
    setResult(null);
    setErrorMessage('');
    setView('search');

    try {
      const response = await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: command.trim() }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || `Falha na consulta (HTTP ${response.status})`);

      const finished: QueryResult = {
        id: data.id,
        command: data.command,
        content: data.content,
        createdAt: data.created_at,
        elapsedMs: data.elapsed_ms,
      };

      setResult(finished);
      setHistory(previous => [finished, ...previous.filter(item => item.id !== finished.id)].slice(0, 50));
      setStatus('success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível consultar a API.');
      setStatus('error');
    }
  }

  function openHistoryItem(item: QueryResult) {
    setResult(item);
    setCommand(item.command);
    setStatus('success');
    setView('search');
  }

  function clearHistory() {
    setHistory([]);
    setResult(null);
    setStatus('idle');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={21} /></div>
          <div><strong>Referência</strong><span>Consulta inteligente</span></div>
        </div>

        <nav className="main-nav">
          <button className={`nav-item ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}><Search size={19} /><span>Nova consulta</span></button>
          <button className={`nav-item ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}><History size={19} /><span>Histórico</span><span className="nav-count">{history.length}</span></button>
          <button className={`nav-item ${view === 'exports' ? 'active' : ''}`} onClick={() => setView('exports')}><FileText size={19} /><span>Exportações</span></button>
        </nav>

        <div className="sidebar-section">
          <p>Pesquisar comandos</p>
          <div className="command-search"><Search size={16}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Nome ou finalidade" /></div>
          <div className="command-list">
            {filteredCommands.map(item => (
              <button key={item.name} onClick={() => { setCommand(item.example); setView('search'); }} className="command-card">
                <span className="command-icon"><Command size={16}/></span>
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
              </button>
            ))}
          </div>
        </div>

        <div className="user-card">
          <div className="avatar">MS</div>
          <div><strong>Matheus</strong><span>Administrador</span></div>
          <button title="Sair"><LogOut size={18}/></button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">PAINEL DE CONSULTAS</p>
            <h1>{view === 'search' ? 'Encontre informações com rapidez.' : view === 'history' ? 'Histórico de consultas.' : 'Central de exportações.'}</h1>
            <p className="subtitle">{view === 'search' ? 'Digite o comando como seria enviado no Telegram. O retorno será exibido exatamente como recebido.' : view === 'history' ? 'Consulte novamente, abra resultados anteriores ou limpe o histórico salvo neste navegador.' : 'Baixe os resultados já consultados em formato TXT.'}</p>
          </div>
          <div className="status-pill"><span></span>Sistema operacional</div>
        </header>

        {view === 'search' && (
          <>
            <section className="hero-card">
              <div className="hero-copy">
                <div className="hero-icon"><Send size={22} /></div>
                <div><h2>Nova consulta</h2><p>Use um comando completo ou escolha uma opção no menu lateral.</p></div>
              </div>
              <form onSubmit={runQuery} className="query-form">
                <label htmlFor="command">Comando da consulta</label>
                <div className="query-row">
                  <div className="input-wrap"><Command size={20}/><input id="command" value={command} onChange={e => setCommand(e.target.value)} placeholder="Ex.: /cpf 000.000.000-00" autoComplete="off" /></div>
                  <button className="primary-button" disabled={status === 'loading'}>{status === 'loading' ? <><span className="spinner"/>Consultando...</> : <><Search size={19}/>Pesquisar</>}</button>
                </div>
                <div className="form-hint"><ShieldCheck size={15}/>Use somente consultas autorizadas e compatíveis com a legislação aplicável.</div>
              </form>
            </section>

            <section className="metrics-grid">
              <article><span className="metric-icon violet"><Activity size={20}/></span><div><small>Consultas salvas</small><strong>{history.length}</strong></div><em>Real</em></article>
              <article><span className="metric-icon blue"><Clock3 size={20}/></span><div><small>Último tempo</small><strong>{result ? `${(result.elapsedMs / 1000).toFixed(1)}s` : '—'}</strong></div><em>API</em></article>
              <article><span className="metric-icon green"><ShieldCheck size={20}/></span><div><small>Status</small><strong>{status === 'error' ? 'Erro' : 'Online'}</strong></div><em>Ao vivo</em></article>
            </section>

            <section className="result-card">
              <div className="result-header">
                <div><span className={`result-status ${status}`}>{status === 'loading' ? 'PROCESSANDO' : status === 'error' ? 'ERRO' : result ? 'CONCLUÍDA' : 'AGUARDANDO'}</span><h2>Resultado da consulta</h2></div>
                {result && <div className="result-actions"><button className="secondary-button" onClick={() => copyValue('all', result.content)}>{copiedId === 'all' ? <Check size={17}/> : <Copy size={17}/>}Copiar tudo</button><button className="secondary-button" onClick={() => downloadText(result)}><Download size={17}/>Exportar</button></div>}
              </div>

              {status === 'loading' ? (
                <div className="loading-state"><div className="pulse-ring"><Send size={28}/></div><h3>Consultando o Telegram</h3><p>Aguardando a resposta do bot. Não feche esta página.</p><div className="progress"><span/></div></div>
              ) : status === 'error' ? (
                <div className="empty-state"><div><ShieldCheck size={28}/></div><h3>Não foi possível concluir</h3><p>{errorMessage}</p></div>
              ) : result ? (
                <div className="result-body">
                  <div className="result-meta"><span><Command size={15}/>{result.command}</span><span><Clock3 size={15}/>{new Date(result.createdAt).toLocaleString('pt-BR')}</span><span><UserRound size={15}/>Matheus</span></div>
                  {parsedFields.length > 0 ? (
                    <div className="fields-layout">
                      {Object.entries(groupedFields).map(([section, fields]) => (
                        <section className="field-section" key={section}>
                          <h3>{section}</h3>
                          <div className="field-grid">
                            {fields.map(field => (
                              <article className="field-card" key={field.id}>
                                <div><small>{field.label}</small><strong>{field.value}</strong></div>
                                <button title={`Copiar ${field.label}`} onClick={() => copyValue(field.id, field.value)}>{copiedId === field.id ? <Check size={16}/> : <Copy size={16}/>}</button>
                              </article>
                            ))}
                          </div>
                        </section>
                      ))}
                      <details className="raw-result"><summary>Ver resposta original</summary><pre>{result.content}</pre></details>
                    </div>
                  ) : <pre>{result.content}</pre>}
                </div>
              ) : (
                <div className="empty-state"><div><Search size={28}/></div><h3>Nenhuma consulta realizada</h3><p>O resultado aparecerá aqui assim que você fizer uma pesquisa.</p></div>
              )}
            </section>
          </>
        )}

        {view === 'history' && (
          <section className="page-card">
            <div className="page-card-header"><div><h2>Consultas anteriores</h2><p>{history.length} resultado(s) salvo(s) neste navegador.</p></div>{history.length > 0 && <button className="danger-button" onClick={clearHistory}><Trash2 size={16}/>Limpar histórico</button>}</div>
            {history.length === 0 ? <div className="empty-state"><div><History size={28}/></div><h3>Histórico vazio</h3><p>As consultas concluídas aparecerão aqui automaticamente.</p></div> : <div className="history-list">{history.map(item => <article className="history-item" key={item.id}><button className="history-main" onClick={() => openHistoryItem(item)}><span className="history-icon"><Command size={17}/></span><span><strong>{item.command}</strong><small>{new Date(item.createdAt).toLocaleString('pt-BR')} · {(item.elapsedMs / 1000).toFixed(1)}s</small></span></button><div className="history-actions"><button title="Copiar resultado" onClick={() => copyValue(`history-${item.id}`, item.content)}>{copiedId === `history-${item.id}` ? <Check size={16}/> : <Copy size={16}/>}</button><button title="Exportar TXT" onClick={() => downloadText(item)}><Download size={16}/></button></div></article>)}</div>}
          </section>
        )}

        {view === 'exports' && (
          <section className="page-card">
            <div className="page-card-header"><div><h2>Arquivos disponíveis</h2><p>Exporte qualquer consulta salva em TXT.</p></div></div>
            {history.length === 0 ? <div className="empty-state"><div><FileText size={28}/></div><h3>Nenhuma exportação disponível</h3><p>Faça uma consulta para liberar o download.</p></div> : <div className="export-grid">{history.map(item => <article className="export-card" key={item.id}><span className="export-icon"><FileText size={22}/></span><div><strong>{item.command}</strong><small>{new Date(item.createdAt).toLocaleString('pt-BR')}</small></div><button className="secondary-button" onClick={() => downloadText(item)}><Download size={16}/>Baixar TXT</button></article>)}</div>}
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
