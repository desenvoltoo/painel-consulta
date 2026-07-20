(() => {
  const SUMMARY_TAB = '__consultados__';
  const state = { batch: null, activeId: SUMMARY_TAB, mountTimer: null };
  const originalFetch = window.fetch.bind(window);

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeXml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  function valueFromCommand(command) {
    const text = String(command || '').trim();
    const firstSpace = text.indexOf(' ');
    return firstSpace >= 0 ? text.slice(firstSpace + 1) : text || 'Consulta';
  }

  function typeFromCommand(command) {
    const text = String(command || '').trim();
    const firstSpace = text.indexOf(' ');
    return (firstSpace >= 0 ? text.slice(0, firstSpace) : text).replace('/', '').toUpperCase() || 'CONSULTA';
  }

  function statusClass(status) {
    return String(status || '').toLowerCase().replaceAll('_', '-');
  }

  function statusLabel(status) {
    const labels = {
      QUEUED: 'Aguardando',
      PROCESSING: 'Consultando',
      COMPLETED: 'Concluída',
      FAILED: 'Falhou',
      CANCELLED: 'Cancelada'
    };
    return labels[status] || status || 'Sem status';
  }

  function parseFields(content) {
    const fields = [];
    String(content || '').split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const listMatch = line.match(/^(\d+)\s*(?:->|→|[-–—])\s*(.+)$/);
      if (listMatch) {
        fields.push({ label: `Item ${listMatch[1]}`, value: listMatch[2].trim() });
        return;
      }
      for (const separator of [':', '→', '->']) {
        const index = line.indexOf(separator);
        if (index > 0) {
          const label = line.slice(0, index).replace(/^[-•*]+\s*/, '').trim();
          const value = line.slice(index + separator.length).trim();
          if (label && value && label.length <= 80) fields.push({ label, value });
          return;
        }
      }
    });
    return fields;
  }

  function copy(value, button) {
    navigator.clipboard.writeText(value || '').then(() => {
      const original = button.textContent;
      button.textContent = 'Copiado';
      setTimeout(() => { button.textContent = original; }, 1000);
    });
  }

  function xmlCell(value, style = '') {
    const styleAttr = style ? ` ss:StyleID="${style}"` : '';
    return `<Cell${styleAttr}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
  }

  function safeSheetName(value, usedNames) {
    const cleaned = String(value || 'Consulta')
      .replace(/[\\/?*\[\]:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 28) || 'Consulta';
    let name = cleaned;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${cleaned.slice(0, 24)} ${suffix}`.slice(0, 31);
      suffix += 1;
    }
    usedNames.add(name);
    return name;
  }

  function buildWorksheet(name, rows) {
    return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${rows.map((row, index) => `<Row>${row.map((cell) => xmlCell(cell, index === 0 ? 'Header' : '')).join('')}</Row>`).join('')}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><Selected/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`;
  }

  function exportBatchSpreadsheet() {
    const batch = state.batch;
    if (!batch) return;
    const items = batch.items || [];
    const usedNames = new Set();
    const worksheets = [];

    const summaryRows = [
      ['Nº', 'Tipo', 'Valor consultado', 'Status', 'Usuário', 'Data', 'Tempo (s)'],
      ...items.map((item, index) => [
        String(index + 1),
        typeFromCommand(item.command),
        valueFromCommand(item.command),
        statusLabel(item.status),
        item.requested_by || batch.requested_by || '',
        item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : '',
        String(Number(item.elapsed_ms || 0) / 1000)
      ])
    ];
    worksheets.push(buildWorksheet(safeSheetName('Consultados', usedNames), summaryRows));

    items.forEach((item, index) => {
      const fields = parseFields(item.content);
      const detailRows = [
        ['Campo', 'Valor'],
        ['Nº da consulta', String(index + 1)],
        ['Tipo', typeFromCommand(item.command)],
        ['Valor consultado', valueFromCommand(item.command)],
        ['Status', statusLabel(item.status)],
        ['Usuário', item.requested_by || batch.requested_by || ''],
        ['Data', item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : ''],
        ['Tempo (s)', String(Number(item.elapsed_ms || 0) / 1000)],
        ...fields.map((field) => [field.label, field.value]),
        ['Resposta original', item.content || item.error || 'Sem resultado ainda.']
      ];
      const tabName = safeSheetName(`${index + 1} ${valueFromCommand(item.command)}`, usedNames);
      worksheets.push(buildWorksheet(tabName, detailRows));
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default"><Alignment ss:Vertical="Top"/><Font ss:FontName="Arial" ss:Size="10"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#6D28D9" ss:Pattern="Solid"/></Style></Styles>${worksheets.join('')}</Workbook>`;
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lote-${batch.id || 'consultas'}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderSummary(items) {
    return `
      <div class="simple-batch-header">
        <div><small>Resumo do lote</small><strong>Leads consultados</strong></div>
        <span class="simple-status">${items.length} item(ns)</span>
      </div>
      <div class="consulted-leads-table">
        <div class="consulted-row consulted-head"><span>#</span><span>Tipo</span><span>Valor consultado</span><span>Status</span></div>
        ${items.map((item, index) => `
          <button type="button" class="consulted-row" data-open-id="${escapeHtml(item.id)}">
            <span>${index + 1}</span>
            <span>${escapeHtml(typeFromCommand(item.command))}</span>
            <strong>${escapeHtml(valueFromCommand(item.command))}</strong>
            <span class="consulted-status ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
          </button>`).join('')}
      </div>`;
  }

  function renderConsultation(active) {
    const fields = parseFields(active.content);
    return `
      <div class="simple-batch-header">
        <div><small>Valor consultado</small><strong>${escapeHtml(valueFromCommand(active.command))}</strong></div>
        <span class="simple-status ${statusClass(active.status)}">${escapeHtml(statusLabel(active.status))}</span>
      </div>
      <div class="consultation-meta">
        <span><small>Tipo</small><strong>${escapeHtml(typeFromCommand(active.command))}</strong></span>
        <span><small>Comando</small><strong>${escapeHtml(active.command || '')}</strong></span>
      </div>
      ${fields.length ? `
        <div class="simple-fields">
          ${fields.map((field, index) => `
            <div class="simple-field-row">
              <div><small>${escapeHtml(field.label)}</small><strong>${escapeHtml(field.value)}</strong></div>
              <button type="button" data-copy="${index}">Copiar</button>
            </div>`).join('')}
        </div>` : `
        <div class="simple-raw-result">
          <p>${active.status === 'COMPLETED' ? 'Resposta da consulta' : 'Aguardando a conclusão desta consulta.'}</p>
          <pre>${escapeHtml(active.content || active.error || 'Sem resultado ainda.')}</pre>
        </div>`}
      ${active.content || active.error ? `<details class="batch-original"><summary>Ver resposta original</summary><pre>${escapeHtml(active.content || active.error || '')}</pre></details>` : ''}`;
  }

  function render() {
    const host = document.querySelector('.active-batch');
    if (!host || !state.batch) return false;

    let box = host.querySelector('.simple-batch-tabs');
    if (!box) {
      box = document.createElement('section');
      box.className = 'simple-batch-tabs';
      host.appendChild(box);
    }

    const items = state.batch.items || [];
    const isSummary = state.activeId === SUMMARY_TAB;
    const active = items.find((item) => item.id === state.activeId) || null;
    if (!isSummary && !active) state.activeId = SUMMARY_TAB;

    box.innerHTML = `
      <div class="simple-batch-title">
        <div>
          <strong>Consultas do lote</strong>
          <span>Todos os leads e resultados ficam nesta tela.</span>
        </div>
        <button type="button" class="export-batch-button" data-export-batch>Exportar lote em planilha</button>
      </div>

      <div class="simple-batch-tabbar">
        <button type="button" class="simple-batch-tab summary-tab ${state.activeId === SUMMARY_TAB ? 'active' : ''}" data-id="${SUMMARY_TAB}">
          <span class="simple-status-dot completed"></span><span>Consultados</span><small>${items.length}</small>
        </button>
        ${items.map((item, index) => `
          <button type="button" class="simple-batch-tab ${item.id === state.activeId ? 'active' : ''}" data-id="${escapeHtml(item.id)}">
            <span class="simple-status-dot ${statusClass(item.status)}"></span>
            <span>${escapeHtml(valueFromCommand(item.command))}</span>
            <small>${index + 1}</small>
          </button>`).join('')}
      </div>

      <div class="simple-batch-content">
        ${state.activeId === SUMMARY_TAB ? renderSummary(items) : active ? renderConsultation(active) : renderSummary(items)}
      </div>
    `;

    box.querySelectorAll('[data-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeId = button.getAttribute('data-id');
        render();
      });
    });

    box.querySelectorAll('[data-open-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeId = button.getAttribute('data-open-id');
        render();
      });
    });

    const current = items.find((item) => item.id === state.activeId);
    const currentFields = current ? parseFields(current.content) : [];
    box.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', () => {
        const field = currentFields[Number(button.getAttribute('data-copy'))];
        if (field) copy(field.value, button);
      });
    });

    box.querySelector('[data-export-batch]')?.addEventListener('click', exportBatchSpreadsheet);
    return true;
  }

  function scheduleRender(attempt = 0) {
    clearTimeout(state.mountTimer);
    state.mountTimer = setTimeout(() => {
      if (!render() && attempt < 12) scheduleRender(attempt + 1);
    }, attempt === 0 ? 0 : 100);
  }

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (/\/api\/queries\/batch$/.test(url) || /\/api\/batches\/[^/?]+/.test(url)) {
        const data = await response.clone().json();
        if (data?.id && Array.isArray(data.items)) {
          const changedBatch = state.batch?.id !== data.id;
          state.batch = data;
          if (changedBatch) state.activeId = SUMMARY_TAB;
          scheduleRender();
        }
      }
    } catch (_) {}
    return response;
  };
})();
