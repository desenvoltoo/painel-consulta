type DeadLetterItem = {
  position: number;
  id?: string | null;
  command?: string | null;
  requested_by?: string | null;
  batch_id?: string | null;
  attempts?: number | null;
  error?: string | null;
  failed_at?: string | null;
  invalid?: boolean;
};

type OperationsData = {
  checked_at: string;
  worker: string;
  worker_details?: any;
  queue_waiting: number;
  queue_processing: number;
  dead_letter_total: number;
  dead_letter_items: DeadLetterItem[];
};

const TOKEN_KEY = 'painel-consulta-token';
let timer: number | undefined;
let rendering = false;

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));
}

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('Sessão não encontrada.');
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || `Erro HTTP ${response.status}`);
  return data;
}

function formatDate(value?: string | null) {
  if (!value) return 'Horário não informado';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR');
}

function buildPanel(data: OperationsData): HTMLElement {
  const section = document.createElement('section');
  section.className = 'page-card operations-panel';
  section.id = 'admin-operations-panel';
  const current = data.worker_details || {};
  section.innerHTML = `
    <div class="page-card-header operations-title">
      <div><h2>Operação e falhas</h2><p>Atualização automática a cada 10 segundos.</p></div>
      <div class="operations-actions"><span class="operations-checked">Atualizado: ${escapeHtml(formatDate(data.checked_at))}</span><button class="secondary-button" data-operation="refresh">Atualizar</button></div>
    </div>
    <div class="operations-cards">
      <article><small>Worker</small><strong class="${data.worker === 'online' ? 'online' : 'offline'}">${escapeHtml(data.worker)}</strong></article>
      <article><small>Aguardando</small><strong>${data.queue_waiting}</strong></article>
      <article><small>Processando</small><strong>${data.queue_processing}</strong></article>
      <article><small>Falhas</small><strong>${data.dead_letter_total}</strong></article>
    </div>
    <div class="current-operation">
      <div><small>Consulta atual</small><strong>${escapeHtml(current.current_command || 'Nenhuma consulta em processamento')}</strong></div>
      <span>${current.current_query_id ? `ID: ${escapeHtml(current.current_query_id)}` : 'Worker livre'}</span>
    </div>
    <div class="dead-letter-header">
      <div><h3>Fila de falhas</h3><p>${data.dead_letter_total} item(ns) aguardando revisão.</p></div>
      ${data.dead_letter_total > 0 ? '<button class="danger-button" data-operation="clear">Limpar falhas</button>' : ''}
    </div>
    <div class="dead-letter-list">
      ${data.dead_letter_items.length === 0 ? '<div class="operations-empty">Nenhuma falha registrada.</div>' : data.dead_letter_items.map(item => `
        <article class="dead-letter-item">
          <div class="dead-letter-main">
            <strong>${escapeHtml(item.command || 'Job inválido')}</strong>
            <small>${escapeHtml(item.requested_by || 'Usuário não informado')} · ${escapeHtml(formatDate(item.failed_at))}</small>
            <p>${escapeHtml(item.error || 'Erro não informado')}</p>
          </div>
          <div class="dead-letter-meta"><span>Tentativas: ${escapeHtml(item.attempts ?? '—')}</span>${item.batch_id ? `<span>Lote: ${escapeHtml(item.batch_id)}</span>` : ''}</div>
          <button class="secondary-button" data-operation="retry" data-position="${item.position}" ${item.invalid ? 'disabled' : ''}>Reprocessar</button>
        </article>`).join('')}
    </div>`;
  return section;
}

async function renderOperations() {
  const adminLayout = document.querySelector('.admin-layout');
  if (!adminLayout || rendering) return;
  rendering = true;
  try {
    const data = await request('/api/admin/operations') as OperationsData;
    const existing = document.getElementById('admin-operations-panel');
    const panel = buildPanel(data);
    existing ? existing.replaceWith(panel) : adminLayout.appendChild(panel);
  } catch (error) {
    const existing = document.getElementById('admin-operations-panel');
    const message = document.createElement('section');
    message.id = 'admin-operations-panel';
    message.className = 'page-card operations-panel';
    message.innerHTML = `<div class="attachment-error">${escapeHtml(error instanceof Error ? error.message : 'Falha ao carregar operação.')}</div>`;
    existing ? existing.replaceWith(message) : adminLayout.appendChild(message);
  } finally {
    rendering = false;
  }
}

async function handleClick(event: Event) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-operation]');
  if (!button) return;
  const operation = button.dataset.operation;
  if (operation === 'refresh') return renderOperations();
  if (operation === 'clear') {
    if (!window.confirm('Limpar toda a fila de falhas?')) return;
    button.disabled = true;
    try { await request('/api/admin/dead-letter', { method: 'DELETE' }); await renderOperations(); }
    catch (error) { window.alert(error instanceof Error ? error.message : 'Falha ao limpar.'); button.disabled = false; }
  }
  if (operation === 'retry') {
    button.disabled = true;
    try { await request(`/api/admin/dead-letter/${button.dataset.position}/retry`, { method: 'POST' }); await renderOperations(); }
    catch (error) { window.alert(error instanceof Error ? error.message : 'Falha ao reprocessar.'); button.disabled = false; }
  }
}

const observer = new MutationObserver(() => {
  const adminLayout = document.querySelector('.admin-layout');
  if (adminLayout && !document.getElementById('admin-operations-panel')) renderOperations().catch(() => undefined);
});

observer.observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', handleClick);
renderOperations().catch(() => undefined);
timer = window.setInterval(() => {
  if (document.querySelector('.admin-layout')) renderOperations().catch(() => undefined);
}, 10000);

window.addEventListener('beforeunload', () => { if (timer) window.clearInterval(timer); });
