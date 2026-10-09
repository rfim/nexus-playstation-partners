(() => {
  const tabs = [...document.querySelectorAll('.fit-tabs [role="tab"]')];
  const panels = [...document.querySelectorAll('.fit-panels [role="tabpanel"]')];
  if (!tabs.length || !panels.length) return;

  function showFit(key, focus = false) {
    const next = tabs.find((tab) => tab.dataset.fit === key);
    if (!next) return;
    tabs.forEach((tab) => {
      const active = tab === next;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.fitPanel !== key; });
    if (focus) next.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showFit(tab.dataset.fit));
    tab.addEventListener('keydown', (event) => {
      let nextIndex;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      showFit(tabs[nextIndex].dataset.fit, true);
    });
  });

  fetch('assets/metrics.json')
    .then((response) => {
      if (!response.ok) throw new Error('Metrics unavailable');
      return response.json();
    })
    .then(({totals}) => {
      const count = `${totals.first_pass_approved_titles} / ${totals.titles_submitted}`;
      const percent = `${Number(totals.first_pass_approval_pct).toFixed(0)}%`;
      document.getElementById('fit-first-pass-fraction').textContent = count;
      document.getElementById('fit-first-pass-percent').textContent = percent;
      document.getElementById('fit-first-pass-headline').textContent = percent;
      document.getElementById('fit-business-fraction').textContent = count;
    })
    .catch(() => { /* Initial values mirror the checked-in synthetic export. */ });
})();
