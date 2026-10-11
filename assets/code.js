// Code browser over assets/code.json (every dbt and pipeline file, exported by build_snippets.py).
(() => {
  const $ = (selector) => document.querySelector(selector);
  const embedded = window.parent !== window;
  const toWorkspace = (message) => window.parent.postMessage({ source: 'nexus-platform', ...message }, location.origin);
  let base = '';
  let current = null;

  fetch('assets/code.json')
    .then((r) => r.json())
    .then((data) => {
      base = data.base;
      renderTree(data.folders);
      const wanted = new URLSearchParams(location.search).get('file');
      const first = data.folders.flatMap((f) => f.files).find((f) => f.path === wanted)
        ?? data.folders.find((f) => f.folder === 'models/marts')?.files[0];
      if (first) show(first);
    })
    .catch(() => { $('#code-files').textContent = 'Source could not be loaded.'; });

  $('#code-filter').addEventListener('input', (event) => {
    const needle = event.target.value.trim().toLowerCase();
    for (const group of document.querySelectorAll('.code-group')) {
      let any = false;
      for (const item of group.querySelectorAll('.code-file')) {
        const hit = !needle || item.dataset.search.includes(needle);
        item.hidden = !hit;
        any ||= hit;
      }
      group.hidden = !any;
      if (needle) group.open = true;
    }
  });

  function renderTree(folders) {
    const nav = $('#code-files');
    nav.replaceChildren();
    for (const folder of folders) {
      const group = document.createElement('details');
      group.className = 'code-group';
      group.open = folder.folder.startsWith('models/') || folder.folder === 'macros';
      const summary = document.createElement('summary');
      summary.innerHTML = '<span></span><small></small>';
      summary.querySelector('span').textContent = folder.folder;
      summary.querySelector('small').textContent = folder.files.length;
      group.append(summary);
      for (const file of folder.files) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `code-file code-lang-${file.language}`;
        // File names wrap at underscores rather than mid-word.
        button.innerHTML = file.path.split('/').pop().replace(/[&<>]/g, '').replace(/_/g, '_<wbr>');
        button.title = file.path;
        button.dataset.path = file.path;
        button.dataset.search = `${file.path}\n${file.code}`.toLowerCase();
        button.addEventListener('click', () => show(file));
        group.append(button);
      }
      nav.append(group);
    }
  }

  function show(file) {
    current = file;
    document.querySelectorAll('.code-file').forEach((b) => b.classList.toggle('is-active', b.dataset.path === file.path));
    const parts = file.path.split('/');
    $('#code-folder').textContent = parts.length > 1 ? `${parts.slice(0, -1).join('/')}/` : '';
    $('#code-path').textContent = parts.at(-1);
    const lines = file.code.replace(/\n$/, '').split('\n');
    const width = String(lines.length).length;
    $('#code-text').textContent = lines.map((line, i) => `${String(i + 1).padStart(width)}  ${line}`).join('\n');
    const actions = $('#code-actions');
    actions.replaceChildren();
    const model = file.path.match(/^(?:models\/[^/]+|snapshots)\/(\w+)\.sql$/)?.[1];
    if (model && embedded) {
      actions.append(button('Preview output in a SQL tab', () => toWorkspace({ type: 'open-sql', title: model, kind: 'table', sql: `select *\nfrom ${model}\nlimit 50;` })));
      actions.append(button('Show in lineage', () => toWorkspace({
        type: 'open-view', view: 'lineage',
        id: file.path.startsWith('snapshots/') ? `snapshot.nexus_partner_analytics.${model}` : `model.nexus_partner_analytics.${model}`,
      })));
    }
    const link = document.createElement('a');
    link.href = base + file.path;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'GitHub ↗';
    actions.append(link);
  }

  function button(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.data?.source !== 'nexus-sql') return;
    if (event.data.type === 'code-open') {
      const target = document.querySelector(`.code-file[data-path="${CSS.escape(event.data.path)}"]`);
      target?.click();
    }
  });
})();
