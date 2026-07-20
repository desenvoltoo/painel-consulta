(() => {
  const state = { batch: null, activeId: null, mountTimer: null };
  const originalFetch = window.fetch.bind(window);

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function valueFromCommand(command) {
    const text = String(command || '').trim();
    const firstSpace = text.indexOf(' ');
    return firstSpace >= 0 ? text.slice(firstSpace + 1) : text || 'Consulta';
  }

  function statusClass(status) {
    return String(status || '').toLowerCase().replaceAll('_', '-');
  }

  function parseFields(content) {
    const fields = [];
    String(content || '').split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
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
    if (!items.some((item) => item.id === state.activeId)) {
      state.activeId = items[0]?.id || null;
    }
    const active = items.find((item) => item.id === state.activeId) || items[0];
    const fields = active ? parseFields(active.content) : [];

    box.innerHTML = `
      <div class="simple-batch-title">
        <div>
          <strong>Resultados do lote</strong>
          <span>Clique em uma aba para ver a consulta.</span>
        </div>
        <span>${items.length} item(ns)</span>
      </div>

      <div class="simple-batch-tabbar">
        ${items.map((item, index) => `
          <button type="button" class="simple-batch-tab ${item.id === active?.id ? 'active' : ''}" data-id="${escapeHtml(item.id)}">
            <span class="simple-status-dot ${statusClass(item.status)}"></span>
            <span>${escapeHtml(valueFromCommand(item.command))}</span>
            <small>${index + 1}</small>
          </button>`).join('')}
      </div>

      <div class="simple-batch-content">
        ${active ? `
          <div class="simple-batch-header">
            <div>
              <small>Consulta selecionada</small>
              <strong>${escapeHtml(active.command || '')}</strong>
            </div>
            <span class="simple-status ${statusClass(active.status)}">${escapeHtml(active.status || '')}</span>
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
        ` : '<div class="simple-raw-result"><p>Nenhuma consulta no lote.</p></div>'}
      </div>
    `;

    box.querySelectorAll('[data-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeId = button.getAttribute('data-id');
        render();
      });
    });

    box.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', () => {
        const field = fields[Number(button.getAttribute('data-copy'))];
        if (field) copy(field.value, button);
      });
    });

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
          state.batch = data;
          if (!state.activeId) state.activeId = data.items[0]?.id || null;
          scheduleRender();
        }
      }
    } catch (_) {}
    return response;
  };
})();
