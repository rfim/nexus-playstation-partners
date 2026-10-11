// Source dialog for standalone view pages: buttons with data-snippet open repository source.
(() => {
  const dialog = document.querySelector('#code-dialog');
  if (!dialog) return;
  let snippets = null;
  document.querySelectorAll('[data-snippet]').forEach((button) => {
    button.addEventListener('click', async () => {
      snippets ??= await fetch('assets/snippets.json').then((r) => r.json());
      const s = snippets[button.dataset.snippet];
      if (!s) return;
      dialog.querySelector('#dialog-title').textContent = s.title;
      dialog.querySelector('#dialog-description').textContent = s.description;
      dialog.querySelector('#dialog-file').textContent = s.filename;
      dialog.querySelector('#dialog-language').textContent = s.language.toUpperCase();
      dialog.querySelector('#dialog-code').textContent = s.code;
      dialog.querySelector('#dialog-link').href = s.link;
      dialog.showModal();
    });
  });
  dialog.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
})();
