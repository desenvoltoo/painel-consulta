import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import './batch-workspace.css';

type QueryItem = {
  id: string;
  command: string;
  status: string;
  content?: string;
  error?: string | null;
  created_at?: string;
  elapsed_ms?: number;
  requested_by?: string;
};

type BatchPayload = {
  id: string;
  command_prefix: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  queued: number;
  processing: number;
  items: QueryItem[];
};

type Field = { label: string; value: string };

const valueFromCommand = (command: string) => {
  const firstSpace = command.indexOf(' ');
  return firstSpace >= 0 ? command.slice(firstSpace + 1) : command;
};

const typeFromCommand = (command: string) => command.split(' ')[0].replace('/', '').toUpperCase();

const statusLabel = (status: string) => ({
  COMPLETED: 'Concluída', PROCESSING: 'Processando', QUEUED: 'Na fila', FAILED: 'Falhou', CANCELLED: 'Cancelada'
}[status] || status);

function parseFields(content = ''): Field[] {
  const fields: Field[] = [];
  content.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    for (const separator of [':', '→', '->']) {
      const index = line.indexOf(separator);
      if (index <= 0) continue;
      const label = line.slice(0, index).replace(/^[-•*]+\s*/, '').trim();
      const value = line.slice(index + separator.length).trim();
      if (label && value && label.length <= 80) fields.push({ label, value });
      return;
    }
  });
  return fields;
}

function safeSheetName(value: string, used: Set<string>) {
  const base = value.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || 'Consulta';
  let name = base;
  let index = 2;
  while (used.has(name)) {
    const suffix = ` ${index++}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name);
  return name;
}

function exportBatch(batch: BatchPayload) {
  const workbook = XLSX.utils.book_new();
  const used = new Set<string>();
  const summary = batch.items.map((item, index) => ({
    Numero: index + 1,
    Tipo: typeFromCommand(item.command),
    Valor_consultado: valueFromCommand(item.command),
    Status: statusLabel(item.status),
    Usuario: item.requested_by || '',
    Data: item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '',
    Tempo_segundos: Number(((item.elapsed_ms || 0) / 1000).toFixed(2)),
    Resultado_original: item.content || item.error || ''
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), safeSheetName('Consultados', used));

  batch.items.forEach((item, index) => {
    const fields = parseFields(item.content);
    const rows = [
      { Campo: 'Valor consultado', Valor: valueFromCommand(item.command) },
      { Campo: 'Tipo', Valor: typeFromCommand(item.command) },
      { Campo: 'Status', Valor: statusLabel(item.status) },
      { Campo: 'Data', Valor: item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '' },
      ...fields.map(field => ({ Campo: field.label, Valor: field.value })),
      { Campo: 'Resposta original', Valor: item.content || item.error || '' }
    ];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      safeSheetName(`${index + 1}-${valueFromCommand(item.command)}`, used)
    );
  });

  XLSX.writeFile(workbook, `lote-${batch.id}.xlsx`);
}

export default function BatchWorkspace({ batch }: { batch: BatchPayload }) {
  const [activeId, setActiveId] = useState('summary');
  const active = batch.items.find(item => item.id === activeId);
  const fields = useMemo(() => parseFields(active?.content), [active?.content]);

  useEffect(() => {
    if (activeId !== 'summary' && !batch.items.some(item => item.id === activeId)) setActiveId('summary');
  }, [activeId, batch.items]);

  async function copy(value: string, button: HTMLButtonElement) {
    await navigator.clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = 'Copiado';
    window.setTimeout(() => { button.textContent = original; }, 1000);
  }

  return <section className="batch-workspace">
    <header className="batch-workspace-title">
      <div><strong>Resultados do lote</strong><span>Todos os consultados e resultados ficam nesta tela.</span></div>
      <button type="button" onClick={() => exportBatch(batch)}>Exportar lote em Excel</button>
    </header>

    <nav className="batch-workspace-tabs" aria-label="Consultas do lote">
      <button className={activeId === 'summary' ? 'active' : ''} onClick={() => setActiveId('summary')}>
        <i className="completed"/><span>Consultados</span><small>{batch.items.length}</small>
      </button>
      {batch.items.map((item, index) => <button key={item.id} className={activeId === item.id ? 'active' : ''} onClick={() => setActiveId(item.id)}>
        <i className={item.status.toLowerCase()}/><span>{valueFromCommand(item.command)}</span><small>{index + 1}</small>
      </button>)}
    </nav>

    <div className="batch-workspace-body">
      {activeId === 'summary' ? <div className="batch-consulted-table">
        <div className="batch-consulted-row head"><span>#</span><span>Tipo</span><span>Valor consultado</span><span>Status</span></div>
        {batch.items.map((item, index) => <button key={item.id} className="batch-consulted-row" onClick={() => setActiveId(item.id)}>
          <span>{index + 1}</span><span>{typeFromCommand(item.command)}</span><strong>{valueFromCommand(item.command)}</strong><em className={item.status.toLowerCase()}>{statusLabel(item.status)}</em>
        </button>)}
      </div> : active ? <>
        <div className="batch-result-header">
          <div><small>Valor consultado</small><strong>{valueFromCommand(active.command)}</strong></div>
          <em className={active.status.toLowerCase()}>{statusLabel(active.status)}</em>
        </div>
        <div className="batch-result-meta"><span><small>Tipo</small><strong>{typeFromCommand(active.command)}</strong></span><span><small>Comando</small><strong>{active.command}</strong></span></div>
        <div className="batch-result-scroll">
          {fields.length ? <div className="batch-fields">{fields.map((field, index) => <article key={`${field.label}-${index}`}>
            <div><small>{field.label}</small><strong>{field.value}</strong></div>
            <button type="button" onClick={event => copy(field.value, event.currentTarget)}>Copiar</button>
          </article>)}</div> : <div className="batch-raw"><p>{active.status === 'COMPLETED' ? 'Resposta da consulta' : 'Aguardando a conclusão desta consulta.'}</p><pre>{active.content || active.error || 'Sem resultado ainda.'}</pre></div>}
          {!!active.content && <details className="batch-original"><summary>Ver resposta original</summary><pre>{active.content}</pre></details>}
        </div>
      </> : null}
    </div>
  </section>;
}
