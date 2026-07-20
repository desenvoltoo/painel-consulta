import { Download, FileText, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import './attachments.css';

export type Attachment = {
  id: string;
  name: string;
  size: number;
  extension?: string;
  stored: boolean;
  download_url?: string;
  expires_in?: number;
};

type Props = {
  queryId: string;
  api: (path: string, options?: RequestInit) => Promise<any>;
};

function formatBytes(bytes: number): string {
  if (!bytes) return 'Tamanho não informado';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function AttachmentsPanel({ queryId, api }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api(`/api/queries/${queryId}/attachments`);
      setAttachments(Array.isArray(data) ? data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar arquivos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [queryId]);

  async function downloadFile(item: Attachment) {
    if (!item.stored) return;
    setDownloadingId(item.id);
    setError('');
    try {
      const refreshed = await api(`/api/queries/${queryId}/attachments/${item.id}/refresh-link`, { method: 'POST' });
      setAttachments(previous => previous.map(current => current.id === item.id ? { ...current, ...refreshed } : current));
      window.location.assign(refreshed.download_url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao gerar o link do arquivo.');
    } finally {
      setDownloadingId('');
    }
  }

  if (!loading && attachments.length === 0 && !error) return null;

  return <section className="attachments-panel">
    <div className="attachments-header">
      <div><h3>Arquivos da consulta</h3><span>O link é renovado automaticamente antes do download.</span></div>
      <button className="secondary-button" onClick={() => load()} disabled={loading}><RefreshCw size={15}/>{loading ? 'Carregando...' : 'Atualizar'}</button>
    </div>
    {error && <div className="attachment-error">{error}</div>}
    <div className="attachments-grid">
      {attachments.map(item => <article className="attachment-card" key={item.id}>
        <span className="attachment-icon"><FileText size={19}/></span>
        <div className="attachment-info"><strong title={item.name}>{item.name}</strong><small>{formatBytes(item.size)}{item.extension ? ` · ${item.extension.toUpperCase()}` : ''}</small></div>
        <button onClick={() => downloadFile(item)} disabled={!item.stored || downloadingId === item.id}>
          <Download size={15}/>{!item.stored ? 'Indisponível' : downloadingId === item.id ? 'Preparando...' : 'Baixar arquivo'}
        </button>
      </article>)}
    </div>
  </section>;
}
