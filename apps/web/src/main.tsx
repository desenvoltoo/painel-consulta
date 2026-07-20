import React, { FormEvent, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, Clock3, Command, Download, FileText, History, LogOut, Search, Send, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import './styles.css';

type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

type QueryResult = {
  id: string;
  command: string;
  content: string;
  createdAt: string;
  elapsedMs: number;
};

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

function App() {
  const [command, setCommand] = useState('');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<QueryStatus>('idle');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [history, setHistory] = useState<QueryResult[]>([]);

  const filteredCommands = useMemo(() => availableCommands.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(filter.toLowerCase())), [filter]);

  async function runQuery(event: FormEvent) {
    event.preventDefault();
    if (!command.trim() || status === 'loading') return;
    setStatus('loading');
    setResult(null);
    setErrorMessage('');

    try {
      const response = await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: command.trim() }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || `Falha na consulta (HTTP ${response.status})`);
      }

      const finished: QueryResult = {
        id: data.id,
        command: data.command,
        content: data.content,
        createdAt: data.created_at,
        elapsedMs: data.elapsed_ms,
      };
      setResult(finished);
      setHistory(previous => [finished, ...previous].slice(0, 8));
      setStatus('success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível consultar a API.');
      setStatus('error');
    }
  }

  function exportResult() {
    if (!result) return;
    const blob = new Blob([`Comando: ${result.command}\nData: ${new Date(result.createdAt).toLocaleString('pt-BR')}\n\n${result.content}`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `consulta-${result.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={21} /></div>
          <div><strong>Referência</strong><span>Consulta inteligente</span></div>
        </div>

        <nav className="main-nav">
          <button className="nav-item active"><Search size={19} /><span>Nova consulta</span></button>
          <button className="nav-item"><History size={19} /><span>Histórico</span><span className="nav-count">{history.length}</span></button>
          <button className="nav-item"><FileText size={19} /><span>Exportações</span></button>
        </nav>

        <div className="sidebar-section">
          <p>Pesquisar comandos</p>
          <div className="command-search"><Search size={16}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Nome ou finalidade" /></div>
          <div className="command-list">
            {filteredCommands.map(item => (
              <button key={item.name} onClick={() => setCommand(item.example)} className="command-card">
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
          <div><p className="eyebrow">PAINEL DE CONSULTAS</p><h1>Encontre informações com rapidez.</h1><p className="subtitle">Digite o comando como seria enviado no Telegram. O retorno será exibido exatamente como recebido.</p></div>
          <div className="status-pill"><span></span>Sistema operacional</div>
        </header>

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
          <article><span className="metric-icon violet"><Activity size={20}/></span><div><small>Consultas nesta sessão</small><strong>{history.length}</strong></div><em>Real</em></article>
          <article><span className="metric-icon blue"><Clock3 size={20}/></span><div><small>Último tempo</small><strong>{result ? `${(result.elapsedMs / 1000).toFixed(1)}s` : '—'}</strong></div><em>API</em></article>
          <article><span className="metric-icon green"><ShieldCheck size={20}/></span><div><small>Status</small><strong>{status === 'error' ? 'Erro' : 'Online'}</strong></div><em>Ao vivo</em></article>
        </section>

        <section className="result-card">
          <div className="result-header">
            <div><span className={`result-status ${status}`}>{status === 'loading' ? 'PROCESSANDO' : status === 'error' ? 'ERRO' : result ? 'CONCLUÍDA' : 'AGUARDANDO'}</span><h2>Resultado da consulta</h2></div>
            {result && <button className="secondary-button" onClick={exportResult}><Download size={17}/>Exportar informações</button>}
          </div>

          {status === 'loading' ? (
            <div className="loading-state"><div className="pulse-ring"><Send size={28}/></div><h3>Consultando o Telegram</h3><p>Aguardando a resposta do bot. Não feche esta página.</p><div className="progress"><span/></div></div>
          ) : status === 'error' ? (
            <div className="empty-state"><div><ShieldCheck size={28}/></div><h3>Não foi possível concluir</h3><p>{errorMessage}</p></div>
          ) : result ? (
            <div className="result-body">
              <div className="result-meta"><span><Command size={15}/>{result.command}</span><span><Clock3 size={15}/>{new Date(result.createdAt).toLocaleString('pt-BR')}</span><span><UserRound size={15}/>Matheus</span></div>
              <pre>{result.content}</pre>
            </div>
          ) : (
            <div className="empty-state"><div><Search size={28}/></div><h3>Nenhuma consulta realizada</h3><p>O resultado aparecerá aqui assim que você fizer uma pesquisa.</p></div>
          )}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
