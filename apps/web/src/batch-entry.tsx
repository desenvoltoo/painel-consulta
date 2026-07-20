import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import BatchWorkspace from './BatchWorkspace';

type BatchPayload = { id: string; items: unknown[] };

const originalFetch = window.fetch.bind(window);
let latestBatch: BatchPayload | null = null;
let root: Root | null = null;
let mountedHost: HTMLElement | null = null;
let timer = 0;

function mount(attempt = 0) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const host = document.querySelector<HTMLElement>('.active-batch');
    if (!host || !latestBatch) {
      if (attempt < 20) mount(attempt + 1);
      return;
    }

    let container = host.querySelector<HTMLElement>('[data-react-batch-workspace]');
    if (!container) {
      container = document.createElement('div');
      container.dataset.reactBatchWorkspace = 'true';
      host.appendChild(container);
    }

    if (mountedHost !== container) {
      root?.unmount();
      root = createRoot(container);
      mountedHost = container;
    }
    root.render(<BatchWorkspace batch={latestBatch as any}/>);
  }, attempt ? 100 : 0);
}

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  try {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (/\/api\/queries\/batch$/.test(url) || /\/api\/batches\/[^/?]+/.test(url)) {
      const data = await response.clone().json();
      if (data?.id && Array.isArray(data.items)) {
        latestBatch = data;
        mount();
      }
    }
  } catch {
    // A interface principal continua funcionando mesmo se o aprimoramento não puder montar.
  }
  return response;
};
