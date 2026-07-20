import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, Check, ChevronDown, Clock3, Copy, Download, FileText, History, LogOut, Search, Send, ShieldCheck, Sparkles, Trash2, UserRound } from 'lucide-react';
import './styles.css';

type QueryStatus = 'idle' | 'loading' | 'success' | 'error';
type ViewName = 'search' | 'history' | 'exports';
type QueryResult = { id: string; command: string; content: string; createdAt: string; elapsedMs: number };
type ParsedField = { id: string; label: string; value: string; section: string };
type CommandOption = {
  command: string;
  label: string;
  description: string;
  placeholder: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  format: (value: string) => string;
  clean: (value: string) => string;
};

const STORAGE_KEY = 'painel-consulta-history-v1';
const digits = (value: string) => value.replace(/\D/g, '');
const upper = (value: string) => value.toUpperCase();

function formatCpf(value: string) {
  const v = digits(value).slice(0, 11);
  return v.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}
function formatPhone(value: string) {
  const v = digits(value).slice(0, 11);
  if (v.length <= 2) return v ? `(${v}` : '';
  if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
  return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
}
function formatCnpj(value: string) {
  const v = digits(value).slice(0, 14);
  return v.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}
function formatCep(value: string) {
  const v = digits(value).slice(0, 8);
  return v.replace(/^(\d{5})(\d)/, '$1-$2');
}
function formatPlate(value: string) {
  return upper(value.replace(/[^a-zA-Z0-9]/g, '')).slice(0, 7);
}
function identity(value: string) { return value; }

const commandOptions: CommandOption[] = [
  { command: '/cpf', label: 'CPF', description: 'Buscar pessoa por CPF', placeholder: '000.000.000-00', inputMode: 'numeric', format: formatCpf, clean: digits },
  { command: '/numero', label: 'Celular', description: 'Buscar pessoa por número', placeholder: '(11) 91111-1111', inputMode: 'tel', format: formatPhone, clean: digits },
  { command: '/email', label: 'E-mail', description: 'Buscar por endereço de e-mail', placeholder: 'nome@email.com', inputMode: 'email', format: identity, clean: value => value.trim() },
  { command: '/placa', label: 'Placa', description: 'Buscar veículo pela placa', placeholder: 'ABC1D23', format: formatPlate, clean: value => formatPlate(value) },
  { command: '/nome1', label: 'Nome completo', description: 'Buscar pelo nome completo', placeholder: 'Digite o nome completo', format: upper, clean: value => value.trim() },
  { command: '/cep1', label: 'CEP', description: 'Gerar consulta por CEP', placeholder: '00000-000', inputMode: 'numeric', format: formatCep, clean: digits },
  { command: '/cbo', label: 'CBO', description: 'Gerar consulta por CBO', placeholder: '000000', inputMode: 'numeric', format: value => digits(value).slice(0, 6), clean: digits },
  { command: '/profissao', label: 'Profissão', description: 'Buscar por profissão', placeholder: 'Digite a profissão', format: upper, clean: value => value.trim() },
  { command: '/empresa', label: 'Empresa', description: 'Buscar por nome da empresa', placeholder: 'Digite o nome da empresa', format: upper, clean: value => value.trim() },
  { command: '/cnpj', label: 'CNPJ', description: 'Buscar empresa por CNPJ', placeholder: '00.000.000/0000-00', inputMode: 'numeric', format: formatCnpj, clean: digits },
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
    if (label && value) fields.push({ id: `${index}-${label}`, label, value, section });
  });
  return fields;
}

function displayCommand(command: string) {
  const option = commandOptions.find(item => command.startsWith(`${item.command} `) || command === item.command);
  return option ? `${option.label}: ${command.slice(option.command.length).trim()}` : command;
}

function downloadText(result: QueryResult) {
  const body = `Consulta: ${displayCommand(result.command)}\nData: ${new Date(result.createdAt).toLocaleString('pt-BR')}\nTempo: ${(result.elapsedMs / 1000).toFixed(1)}s\n\n${result.content}`;
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
  const [selectedCommand, setSelectedCommand] = useState('/cpf');
  const [searchValue, setSearchValue] = useState('');
  const [status, setStatus] = useState<QueryStatus>('idle');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [history, setHistory] = useState<QueryResult[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50))), [history]);

  const selectedOption = commandOptions.find(item => item.command === selectedCommand) || commandOptions[0];
  const parsedFields = useMemo(() => parseFields(result?.content || ''), [result]);
  const groupedFields = useMemo(() => parsedFields.reduce<Record<string, ParsedField[]>>((groups, field) => {
    (groups[field.section] ||= []).push(field);
    return groups;
  }, {}), [parsedFields]);

  async function copyValue(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(''), 1400);
  }

  function changeCommand(command: string) {
    setSelectedCommand(command);
    setSearchValue('');
    setErrorMessage('');
  }

  async function runQuery(event: FormEvent) {
    event.preventDefault();
    const cleaned = selectedOption.clean(searchValue);
    if (!cleaned || status === 'loading') return;
    const command = `${selectedOption.command} ${cleaned}`;
    setStatus('loading');
    setResult(null);
    setErrorMessage('');
    setView('search');

    try {
      const response = await fetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || `Falha na consulta (HTTP ${response.status})`);
      const finished: QueryResult = { id: data.id, command: data.command, content: data.content, createdAt: data.created_at, elapsedMs: data.elapsed_ms };
      setResult(finished);
      setHistory(previous => [finished, ...previous.filter(item => item.id !== finished.id)].slice(0, 50));
      setStatus('success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível consultar a API.');
      setStatus('error');
    }
  }

  function openHistoryItem(item: QueryResult) {
    const option = commandOptions.find(candidate => item.command.startsWith(`${candidate.command} `));
    if (option) {
      setSelectedCommand(option.command);
      setSearchValue(option.format(item.command.slice(option.command.length).trim()));
    }
    setResult(item);
    setStatus('success');
    setView('search');
  }

  function clearHistory() {
    setHistory([]);
    setResult(null);
    setStatus('idle');
  }

  return (
    <div className="app-shell compact-sidebar">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Sparkles size={21} /></div><div><strong>Referência</strong><span>Consulta inteligente</span></div></div>
        <nav className="main-nav">
          <button className={`nav-item ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}><Search size={19} /><span>Nova consulta</span></button>
          <button className={`nav-item ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}><History size={19} /><span>Histórico</span><span className="nav-count">{history.length}</span></button>
          <button className={`nav-item ${view === 'exports' ? 'active' : ''}`} onClick={() => setView('exports')}><FileText size={19} /><span>Exportações</span></button>
        </nav>
        <div className="user-card"><div className="avatar">MS</div><div><strong>Matheus</strong><span>Administrador</span></div><button title="Sair"><LogOut size={18}/></button></div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div><p className="eyebrow">PAINEL DE CONSULTAS</p><h1>{view === 'search' ? 'Buscar informações.' : view === 'history' ? 'Histórico de consultas.' : 'Central de exportações.'}</h1><p className="subtitle">{view === 'search' ? 'Escolha o tipo de busca e informe o dado. O comando do Telegram é montado automaticamente.' : view === 'history' ? 'Abra resultados anteriores ou limpe o histórico salvo neste navegador.' : 'Baixe os resultados já consultados em formato TXT.'}</p></div>
          <div className="status-pill"><span></span>Sistema operacional</div>
        </header>

        {view === 'search' && <>
          <section className="hero-card search-panel">
            <div className="hero-copy"><div className="hero-icon"><Send size={22}/></div><div><h2>Nova consulta</h2><p>Selecione o tipo e preencha somente o valor solicitado.</p></div></div>
            <form onSubmit={runQuery} className="query-form">
              <div className="search-type-row">
                <label htmlFor="search-type">Tipo de consulta</label>
                <div className="select-wrap"><select id="search-type" value={selectedCommand} onChange={event => changeCommand(event.target.value)}>{commandOptions.map(option => <option key={option.command} value={option.command}>{option.label} — {option.description}</option>)}</select><ChevronDown size={18}/></div>
              </div>
              <label htmlFor="search-value">{selectedOption.label}</label>
              <div className="query-row">
                <div className="input-wrap"><Search size={20}/><input id="search-value" value={searchValue} onChange={event => setSearchValue(selectedOption.format(event.target.value))} placeholder={selectedOption.placeholder} inputMode={selectedOption.inputMode} autoComplete="off" /></div>
                <button className="primary-button" disabled={status === 'loading' || !selectedOption.clean(searchValue)}>{status === 'loading' ? <><span className="spinner"/>Consultando...</> : <>Buscar {selectedOption.label.toLowerCase()}</>}</button>
              </div>
              <div className="form-hint"><ShieldCheck size={15}/>O comando é ocultado e enviado automaticamente ao Telegram.</div>
            </form>
          </section>

          <section className="metrics-grid">
            <article><span className="metric-icon violet"><Activity size={20}/></span><div><small>Consultas salvas</small><strong>{history.length}</strong></div><em>Real</em></article>
            <article><span className="metric-icon blue"><Clock3 size={20}/></span><div><small>Último tempo</small><strong>{result ? `${(result.elapsedMs / 1000).toFixed(1)}s` : '—'}</strong></div><em>API</em></article>
            <article><span className="metric-icon green"><ShieldCheck size={20}/></span><div><small>Status</small><strong>{status === 'error' ? 'Erro' : 'Online'}</strong></div><em>Ao vivo</em></article>
          </section>

          <section className="result-card">
            <div className="result-header"><div><span className={`result-status ${status}`}>{status === 'loading' ? 'PROCESSANDO' : status === 'error' ? 'ERRO' : result ? 'CONCLUÍDA' : 'AGUARDANDO'}</span><h2>Resultado da consulta</h2></div>{result && <div className="result-actions"><button className="secondary-button" onClick={() => copyValue('all', result.content)}>{copiedId === 'all' ? <Check size={17}/> : <Copy size={17}/>}Copiar tudo</button><button className="secondary-button" onClick={() => downloadText(result)}><Download size={17}/>Exportar</button></div>}</div>
            {status === 'loading' ? <div className="loading-state"><div className="pulse-ring"><Send size={28}/></div><h3>Consultando o Telegram</h3><p>Aguardando a resposta do bot.</p><div className="progress"><span/></div></div> : status === 'error' ? <div className="empty-state"><div><ShieldCheck size={28}/></div><h3>Não foi possível concluir</h3><p>{errorMessage}</p></div> : result ? <div className="result-body"><div className="result-meta"><span><Search size={15}/>{displayCommand(result.command)}</span><span><Clock3 size={15}/>{new Date(result.createdAt).toLocaleString('pt-BR')}</span><span><UserRound size={15}/>Matheus</span></div>{parsedFields.length > 0 ? <div className="fields-layout">{Object.entries(groupedFields).map(([section, fields]) => <section className="field-section" key={section}><h3>{section}</h3><div className="field-grid">{fields.map(field => <article className="field-card" key={field.id}><div><small>{field.label}</small><strong>{field.value}</strong></div><button title={`Copiar ${field.label}`} onClick={() => copyValue(field.id, field.value)}>{copiedId === field.id ? <Check size={16}/> : <Copy size={16}/>}</button></article>)}</div></section>)}<details className="raw-result"><summary>Ver resposta original</summary><pre>{result.content}</pre></details></div> : <pre>{result.content}</pre>}</div> : <div className="empty-state"><div><Search size={28}/></div><h3>Nenhuma consulta realizada</h3><p>O resultado aparecerá aqui após a busca.</p></div>}
          </section>
        </>}

        {view === 'history' && <section className="page-card"><div className="page-card-header"><div><h2>Consultas anteriores</h2><p>{history.length} resultado(s) salvo(s) neste navegador.</p></div>{history.length > 0 && <button className="danger-button" onClick={clearHistory}><Trash2 size={16}/>Limpar histórico</button>}</div>{history.length === 0 ? <div className="empty-state"><div><History size={28}/></div><h3>Histórico vazio</h3><p>As consultas concluídas aparecerão aqui automaticamente.</p></div> : <div className="history-list">{history.map(item => <article className="history-item" key={item.id}><button className="history-main" onClick={() => openHistoryItem(item)}><span className="history-icon"><Search size={17}/></span><span><strong>{displayCommand(item.command)}</strong><small>{new Date(item.createdAt).toLocaleString('pt-BR')} · {(item.elapsedMs / 1000).toFixed(1)}s</small></span></button><div className="history-actions"><button title="Copiar resultado" onClick={() => copyValue(`history-${item.id}`, item.content)}>{copiedId === `history-${item.id}` ? <Check size={16}/> : <Copy size={16}/>}</button><button title="Exportar TXT" onClick={() => downloadText(item)}><Download size={16}/></button></div></article>)}</div>}</section>}

        {view === 'exports' && <section className="page-card"><div className="page-card-header"><div><h2>Arquivos disponíveis</h2><p>Exporte qualquer consulta salva em TXT.</p></div></div>{history.length === 0 ? <div className="empty-state"><div><FileText size={28}/></div><h3>Nenhuma exportação disponível</h3><p>Faça uma consulta para liberar o download.</p></div> : <div className="export-grid">{history.map(item => <article className="export-card" key={item.id}><span className="export-icon"><FileText size={22}/></span><div><strong>{displayCommand(item.command)}</strong><small>{new Date(item.createdAt).toLocaleString('pt-BR')}</small></div><button className="secondary-button" onClick={() => downloadText(item)}><Download size={16}/>Baixar TXT</button></article>)}</div>}</section>}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
