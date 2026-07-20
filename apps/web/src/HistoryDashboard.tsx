import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import './final.css';

export type HistoryItem = {
  id: string;
  command: string;
  status: string;
  content: string;
  error?: string | null;
  createdAt: string;
  elapsedMs: number;
  requestedBy: string;
  requestedByEmail: string;
};

type Props = {
  items: HistoryItem[];
  displayCommand: (command: string) => string;
  onOpen: (item: HistoryItem) => void;
  onRefresh: () => void;
};

export default function HistoryDashboard({ items, displayCommand, onOpen, onRefresh }: Props) {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('ALL');
  const [user, setUser] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const users = useMemo(() => [...new Set(items.map(item => item.requestedBy).filter(Boolean))].sort(), [items]);
  const filtered = useMemo(() => {
    const normalized = term.trim().toLowerCase();
    return items.filter(item => {
      if (status !== 'ALL' && item.status !== status) return false;
      if (user !== 'ALL' && item.requestedBy !== user) return false;
      if (!normalized) return true;
      return [displayCommand(item.command), item.content, item.error || '', item.requestedBy, item.requestedByEmail]
        .some(value => value.toLowerCase().includes(normalized));
    });
  }, [items, status, user, term, displayCommand]);

  const completed = filtered.filter(item => item.status === 'COMPLETED').length;
  const failed = filtered.filter(item => item.status === 'FAILED').length;
  const average = filtered.length ? filtered.reduce((sum, item) => sum + item.elapsedMs, 0) / filtered.length / 1000 : 0;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return <section className="page-card final-history">
    <div className="page-card-header"><div><h2>Consultas anteriores</h2><p>{filtered.length} de {items.length} resultado(s).</p></div><button className="secondary-button" onClick={onRefresh}>Atualizar</button></div>
    <div className="history-kpis"><article><small>Encontradas</small><strong>{filtered.length}</strong></article><article><small>Concluídas</small><strong>{completed}</strong></article><article><small>Falhas</small><strong>{failed}</strong></article><article><small>Tempo médio</small><strong>{average.toFixed(1)}s</strong></article></div>
    <div className="history-filters"><label className="history-search"><Search size={17}/><input value={term} onChange={event => { setTerm(event.target.value); setPage(1); }} placeholder="Buscar comando, resultado, usuário ou e-mail"/></label><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="ALL">Todos os status</option><option value="COMPLETED">Concluídas</option><option value="FAILED">Falhas</option><option value="QUEUED">Na fila</option><option value="PROCESSING">Processando</option><option value="CANCELLED">Canceladas</option></select><select value={user} onChange={event => { setUser(event.target.value); setPage(1); }}><option value="ALL">Todos os usuários</option>{users.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
    <div className="history-list">{visible.map(item => <article className="history-item" key={item.id}><button className="history-main" onClick={() => onOpen(item)}><span><strong>{displayCommand(item.command)}</strong><small>{new Date(item.createdAt).toLocaleString('pt-BR')} · {item.requestedBy} · {(item.elapsedMs / 1000).toFixed(1)}s</small></span></button><span className={`history-status ${item.status.toLowerCase()}`}>{item.status}</span></article>)}</div>
    {!visible.length && <div className="history-empty">Nenhum resultado corresponde aos filtros.</div>}
    <div className="history-pagination"><button disabled={safePage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Anterior</button><span>Página {safePage} de {pages}</span><button disabled={safePage >= pages} onClick={() => setPage(value => Math.min(pages, value + 1))}>Próxima</button></div>
  </section>;
}
