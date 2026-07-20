import { AlertTriangle, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import './final.css';

type Api = (path: string, options?: RequestInit) => Promise<any>;
type Props = { api: Api };
type DeadItem = { position: number; id?: string; command?: string; requested_by?: string; attempts?: number; error?: string; failed_at?: string; invalid?: boolean };
type Operations = { worker: string; queue_waiting: number; queue_processing: number; dead_letter_total: number; dead_letter_items: DeadItem[]; worker_details?: any };
type AuditItem = { id: string; actor: string; actor_email?: string; method: string; path: string; status_code: number; created_at: string; elapsed_ms: number };

export default function AdminMonitoring({ api }: Props) {
  const [operations, setOperations] = useState<Operations | null>(null);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    try {
      setError('');
      const [operationData, auditData] = await Promise.all([api('/api/admin/operations'), api('/api/admin/audit?limit=100')]);
      setOperations(operationData);
      setAudit(Array.isArray(auditData) ? auditData : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar monitoramento.');
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
    const timer = window.setInterval(() => load().catch(() => undefined), 10000);
    return () => window.clearInterval(timer);
  }, []);

  async function retry(position: number) {
    setBusy(`retry-${position}`);
    try { await api(`/api/admin/dead-letter/${position}/retry`, { method: 'POST' }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao reprocessar.'); }
    finally { setBusy(''); }
  }

  async function clearFailures() {
    if (!window.confirm('Limpar todos os registros da fila de falhas?')) return;
    setBusy('clear');
    try { await api('/api/admin/dead-letter', { method: 'DELETE' }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao limpar fila.'); }
    finally { setBusy(''); }
  }

  async function exportAudit() {
    const data = await api('/api/admin/audit/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `auditoria-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="admin-monitoring">
    {error && <div className="attachment-error">{error}</div>}
    <section className="page-card"><div className="page-card-header"><div><h2>Operação e falhas</h2><p>Atualização automática a cada 10 segundos.</p></div><button className="secondary-button" onClick={load}><RefreshCw size={16}/>Atualizar</button></div>
      <div className="operations-kpis"><article><small>Worker</small><strong>{operations?.worker || '—'}</strong></article><article><small>Aguardando</small><strong>{operations?.queue_waiting ?? '—'}</strong></article><article><small>Processando</small><strong>{operations?.queue_processing ?? '—'}</strong></article><article><small>Falhas</small><strong>{operations?.dead_letter_total ?? '—'}</strong></article></div>
      {operations?.worker_details?.current_command && <div className="current-operation"><ShieldCheck size={18}/><div><small>Consulta atual</small><strong>{operations.worker_details.current_command}</strong><span>{operations.worker_details.current_query_id}</span></div></div>}
      <div className="section-toolbar"><strong>Fila de falhas</strong><button className="danger-button" onClick={clearFailures} disabled={!operations?.dead_letter_total || busy === 'clear'}><Trash2 size={15}/>{busy === 'clear' ? 'Limpando...' : 'Limpar falhas'}</button></div>
      <div className="failure-list">{operations?.dead_letter_items?.map(item => <article key={`${item.position}-${item.id || 'invalid'}`}><span className="failure-icon"><AlertTriangle size={17}/></span><div><strong>{item.command || 'Item inválido'}</strong><small>{item.requested_by || 'Sem usuário'} · {item.failed_at ? new Date(item.failed_at).toLocaleString('pt-BR') : 'Sem horário'}</small><p>{item.error || 'Erro não informado'}</p></div><button onClick={() => retry(item.position)} disabled={item.invalid || busy === `retry-${item.position}`}><RotateCcw size={15}/>{busy === `retry-${item.position}` ? 'Reenviando...' : 'Reprocessar'}</button></article>)}</div>
      {!operations?.dead_letter_items?.length && <div className="history-empty">Nenhuma falha registrada.</div>}
    </section>

    <section className="page-card"><div className="page-card-header"><div><h2>Auditoria</h2><p>Últimas {audit.length} ações administrativas e de autenticação.</p></div><button className="secondary-button" onClick={exportAudit}>Exportar JSON</button></div>
      <div className="audit-table"><div className="audit-head"><span>Data</span><span>Usuário</span><span>Ação</span><span>Status</span><span>Tempo</span></div>{audit.map(item => <div className="audit-row" key={item.id}><span>{new Date(item.created_at).toLocaleString('pt-BR')}</span><span>{item.actor || item.actor_email || 'Anônimo'}</span><span>{item.method} {item.path}</span><span className={item.status_code < 400 ? 'audit-ok' : 'audit-error'}>{item.status_code}</span><span>{item.elapsed_ms} ms</span></div>)}</div>
      {!audit.length && <div className="history-empty">A auditoria ainda não possui registros.</div>}
    </section>
  </div>;
}
