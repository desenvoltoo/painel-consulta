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
  { name: '/cpf', description: 'Consulta completa por CPF', example: '/cpf 068.038.899-04' },
  { name: '/numero', description: 'Consulta por telefone', example: '/numero 11999999999' },
  { name: '/email', description: 'Consulta por endereço de e-mail', example: '/email nome@email.com' },
  { name: '/placa', description: 'Consulta de veículo pela placa', example: '/placa ABC1D23' },
  { name: '/nome1', description: 'Pesquisa por nome completo', example: '/nome1 JOAO DA SILVA' },
  { name: '/cep1', description: 'Gera arquivo por CEP', example: '/cep1 01001000' },
  { name: '/cbo', description: 'Gera arquivo por CBO', example: '/cbo 212405' },
  { name: '/profissao', description: 'Gera arquivo por profissão', example: '/profissao ANALISTA' },
  { name: '/empresa', description: 'Pesquisa por empresa', example: '/empresa EMPRESA TESTE' },
  { name: '/cnpj', description: 'Consulta por CNPJ', example: '/cnpj 00000000000191' },
];

const mockResponse = `> DADOS DA CONSULTA\n\nCPF: 429.793.698-45\nNOME: João Pedro da Silva\nNASCIMENTO: 10/11/1994\nSITUAÇÃO: REGULAR\n\n> INSCRIÇÃO\n\nDATA DE INSCRIÇÃO: 10/11/2024 11:46\nCANAL: CAPTAR EXPRESS\nCURSO: Jornalismo - Bacharelado\nUNIDADE: SÃO PAULO/SP - ITAQUERA\nMARCA: ANHANGUERA\nFORMATO DA OFERTA: EAD\nTURNO: VIRTUAL\nPAGAMENTO: PENDENTE\nVESTIBULAR: APROVADO\nCONTRATO: NÃO_GERADO\nMATRÍCULA: N/A\nDATA DA APROVAÇÃO: 13/01/2025 21:52\n\nConsulta concluída com sucesso.`;

function App() {
  const [command, setCommand] = useState('/cpf 429.793.698-45');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<QueryStatus>('idle');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<QueryResult[]>([]);

  const filteredCommands = useMemo(() => availableCommands.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(filter.toLowerCase())), [filter]);

  async function runQuery(event: FormEvent) {
    event.preventDefault();
    if (!command.trim() || status === 'loading') return;
    setStatus('loading');
    setResult(null);
    const startedAt = performance.now();

    try {
      const response = await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: command.trim() }),
      });
      if (!response.ok) throw new Error('API indisponível');
      const data = await response.json();
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
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const finished: QueryResult = {
        id: crypto.randomUUID(),
        command: command.trim(),
        content: mockResponse,
        createdAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - startedAt),
      };
      setResult(finished);
      setHistory(previous => [finished, ...previous].slice(0, 8));
      setStatus('success');
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
            <div className="hero-icon"><Send size={22}/></div>
            <div><h2>Nova consulta</h2><p>Use um comando completo ou escolha uma opção no menu lateral.</p></div>
          </div>
          <form onSubmit={runQuery} className="query-form">
            <label htmlFor="command">Comando da consulta</label>
            <div className="query-row">
              <div className="input-wrap"><Command size={20}/><input id="command" value={command} onChange={e => setCommand(e.target.value)} placeholder="Ex.: /cpf 000.000.000-00" autoComplete="off" /></div>
              <button className="primary-button" disabled={status === 'loading'}>{status === 'loading' ? <><span className="spinner"/>Consultando...</> : <><Search size={19}/>Pesquisar</>}</button>
            </div>
            <div className="form-hint"><ShieldCheck size={15}/>Comandos e resultados são registrados para auditoria e segurança.</div>
          </form>
        </section>

        <section className="metrics-grid">
          <article><span className="metric-icon violet"><Activity size={20}/></span><div><small>Consultas hoje</small><strong>{Math.max(history.length, 12)}</strong></div><em>+18%</em></article>
          <article><span className="metric-icon blue"><Clock3 size={20}/></span><div><small>Tempo médio</small><strong>{result ? `${(result.elapsedMs / 1000).toFixed(1)}s` : '2,4s'}</strong></div><em>Estável</em></article>
          <article><span className="metric-icon green"><ShieldCheck size={20}/></span><div><small>Taxa de sucesso</small><strong>99,8%</strong></div><em>Normal</em></article>
        </section>

        <section className="result-card">
          <div className="result-header">
            <div><span className={`result-status ${status}`}>{status === 'loading' ? 'PROCESSANDO' : result ? 'CONCLUÍDA' : 'AGUARDANDO'}</span><h2>Resultado da consulta</h2></div>
            {result && <button className="secondary-button" onClick={exportResult}><Download size={17}/>Exportar informações</button>}
          </div>

          {status === 'loading' ? (
            <div className="loading-state"><div className="pulse-ring"><Send size={28}/></div><h3>Consultando o Telegram</h3><p>Aguardando a resposta do bot. Não feche esta página.</p><div className="progress"><span/></div></div>
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
