(() => {
  const state = { batch: null, activeId: null, mountedFor: null };
  const originalFetch = window.fetch.bind(window);

  function mapBatch(data) {
    if (!data || !data.id || !Array.isArray(data.items)) return null;
    return data;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function commandLabel(command) {
    const parts = String(command || '').trim().split(/\s+/, 2);
    return parts.length > 1 ? parts[1] : command || 'Consulta';
  }

  function statusClass(status) {
    return String(status || '').toLowerCase().replaceAll('_', '-');
  }

  function parseRows(content) {
    const rows = [];
    const text = String(content || '');
    text.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const list = line.match(/^(\d+)\s*(?:->|→|[-–—])\s*(.+)$/);
      if (list) {
        const cols = list[2].split('|').map((item) => item.trim()).filter(Boolean);
        rows.push({ label: `Item ${list[1]}`, value: cols.join(' | ') });
        return;
      }
      for (const separator of [':', '→', '->']) {
        const index = line.indexOf(separator);
        if (index > 0) {
          const label = line.slice(0, index).replace(/^[-•*]+\s*/, '').trim();
          const value = line.slice(index + separator.length).trim();
          if (label && value && label.length < 90) rows.push({ label, value });
          return;
        }
      }
    });
    return rows;
  }

  function copyText(value, button) {
    navigator.clipboard.writeText(value).then(() => {
      const old = button.textContent;
      button.textContent = 'Copiado';
      setTimeout(() => { button.textContent = old; }, 1200);
    });
  }

  function downloadText(item) {
    const content = [
      `Consulta: ${item.command || ''}`,
      `Status: ${item.status || ''}`,
      `Usuário: ${item.requested_by || ''}`,
      `Data: ${item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : ''}`,
      '',
      item.content || item.error || ''
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consulta-${item.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function render() {
    const host = document.querySelector('.active-batch');
    if (!host || !state.batch) return;

    const existing = host.querySelector('.batch-sheets-workspace');
    if (existing && state.mountedFor === state.batch.id) {
      updateWorkspace(existing);
      return;
    }
    existing?.remove();

    const workspace = document.createElement('section');
    workspace.className = 'batch-sheets-workspace';
    host.appendChild(workspace);
    state.mountedFor = state.batch.id;
    if (!state.activeId || !state.batch.items.some((item) => item.id === state.activeId)) {
      state.activeId = state.batch.items[0]?.id || null;
    }
    updateWorkspace(workspace);
  }

  function updateWorkspace(workspace) {
    const batch = state.batch;
    if (!batch) return;
    const items = batch.items || [];
    const active = items.find((item) => item.id === state.activeId) || items[0];
    const rows = active ? parseRows(active.content) : [];

    workspace.innerHTML = `
      <div class="batch-sheets-toolbar">
        <div>
          <strong>Planilha do lote</strong>
          <span>${items.length} consulta(s) — cada aba representa uma consulta</span>
        </div>
        <div class="batch-sheets-actions">
          ${active ? '<button type="button" data-action="copy-all">Copiar resultado</button><button type="button" data-action="download">Baixar TXT</button>' : ''}
        </div>
      </div>
      <div class="batch-sheet-canvas">
        ${active ? `
          <div class="batch-sheet-titlebar">
            <div><small>Consulta</small><strong>${escapeHtml(active.command || '')}</strong></div>
            <span class="batch-sheet-status ${statusClass(active.status)}">${escapeHtml(active.status || '')}</span>
          </div>
          <div class="batch-sheet-grid">
            <div class="batch-sheet-row batch-sheet-head"><span>Campo</span><span>Valor</span><span>Ação</span></div>
            ${rows.length ? rows.map((row, index) => `
              <div class="batch-sheet-row">
                <span class="batch-sheet-label">${escapeHtml(row.label)}</span>
                <span class="batch-sheet-value">${escapeHtml(row.value)}</span>
                <button type="button" data-copy-index="${index}">Copiar</button>
              </div>`).join('') : `
              <div class="batch-sheet-empty">
                <strong>${active.status === 'COMPLETED' ? 'Resposta original' : 'Consulta ainda não concluída'}</strong>
                <pre>${escapeHtml(active.content || active.error || 'Aguardando processamento...')}</pre>
              </div>`}
          </div>
        ` : '<div class="batch-sheet-empty"><strong>Nenhuma consulta no lote.</strong></div>'}
      </div>
      <div class="batch-sheet-tabs" role="tablist" aria-label="Consultas do lote">
        ${items.map((item, index) => `
          <button type="button" class="batch-sheet-tab ${item.id === active?.id ? 'active' : ''}" data-query-id="${escapeHtml(item.id)}" role="tab">
            <span class="batch-tab-dot ${statusClass(item.status)}"></span>
            <span>${escapeHtml(commandLabel(item.command))}</span>
            <small>${index + 1}</small>
          </button>`).join('')}
      </div>
    `;

    workspace.querySelectorAll('[data-query-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeId = button.getAttribute('data-query-id');
        updateWorkspace(workspace);
      });
    });
    workspace.querySelectorAll('[data-copy-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = rows[Number(button.getAttribute('data-copy-index'))];
        if (row) copyText(row.value, button);
      });
    });
    workspace.querySelector('[data-action="copy-all"]')?.addEventListener('click', (event) => {
      copyText(active.content || active.error || '', event.currentTarget);
    });
    workspace.querySelector('[data-action="download"]')?.addEventListener('click', () => downloadText(active));
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (/\/api\/queries\/batch$/.test(url) || /\/api\/batches\/[^/?]+/.test(url)) {
        const data = await response.clone().json();
        const batch = mapBatch(data);
        if (batch) {
          state.batch = batch;
          if (!state.activeId) state.activeId = batch.items[0]?.id || null;
          setTimeout(render, 0);
        }
      }
    } catch (_) {}
    return response;
  };

  const observer = new MutationObserver(() => {
    if (document.querySelector('.active-batch')) render();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
