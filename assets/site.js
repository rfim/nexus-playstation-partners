const $ = (selector) => document.querySelector(selector);

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function formatPercent(value) {
  return `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`;
}

function renderPartner(partner) {
  const detail = $('#partner-detail');
  detail.replaceChildren();
  const eyebrow = document.createElement('p');
  eyebrow.className = 'panel-eyebrow';
  eyebrow.textContent = `${partner.region} / SYNTHETIC PARTNER`;
  const title = document.createElement('h3');
  title.textContent = partner.partner_name;
  const intro = document.createElement('p');
  intro.textContent = `${partner.titles_submitted} submitted titles · ${partner.submission_attempts} review attempts`;
  const stats = document.createElement('div');
  stats.className = 'partner-stats';
  const values = [
    [formatPercent(partner.first_pass_approval_pct), 'First-pass approval'],
    [`${partner.titles_published} / ${partner.titles_submitted}`, 'Titles published'],
    [`${partner.avg_review_hours}h`, 'Mean review time']
  ];
  for (const [value, label] of values) {
    const item = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = value;
    const small = document.createElement('small');
    small.textContent = label;
    item.append(strong, small);
    stats.append(item);
  }
  const takeaway = document.createElement('p');
  takeaway.className = 'partner-takeaway';
  if (partner.first_pass_approval_pct === 0) {
    takeaway.textContent = 'Conversation starter: both titles needed another review attempt. Check submission criteria and status history before assuming why.';
  } else if (partner.titles_published < partner.titles_submitted) {
    takeaway.textContent = 'Conversation starter: approval looks strong, yet one title has no storefront publication event. Investigate the handoff and timing.';
  } else {
    takeaway.textContent = 'Conversation starter: both titles reached publication. Inspect the repeat review and lead time for process improvement.';
  }
  detail.append(eyebrow, title, intro, stats, takeaway);
}

async function setupMetrics() {
  const data = await loadJSON('assets/metrics.json');
  $('#total-first-pass').textContent = formatPercent(data.totals.first_pass_approval_pct);
  $('#total-published').textContent = `${data.totals.titles_published} / ${data.totals.titles_submitted}`;
  $('#total-attempts').textContent = data.totals.submission_attempts;
  const list = $('#partner-list');
  list.replaceChildren();
  data.partners.forEach((partner, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `partner-button${index === 0 ? ' is-active' : ''}`;
    button.setAttribute('aria-pressed', String(index === 0));
    const name = document.createElement('strong');
    name.textContent = partner.partner_name;
    const summary = document.createElement('small');
    summary.textContent = `${partner.region} · ${formatPercent(partner.first_pass_approval_pct)} first-pass approval`;
    button.append(name, summary);
    button.addEventListener('click', () => {
      list.querySelectorAll('.partner-button').forEach((item) => {
        item.classList.remove('is-active');
        item.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');
      renderPartner(partner);
    });
    list.append(button);
  });
  if (data.partners.length) renderPartner(data.partners[0]);
  setupSignalLab(data.totals);
  setupMathExplorer(data.totals);
}

function setupSignalLab(totals) {
  const signals = {
    approval: {
      value: formatPercent(totals.first_pass_approval_pct),
      explanation: `${totals.first_pass_approved_titles} of ${totals.titles_submitted} submitted titles cleared review on attempt one.`,
      share: totals.first_pass_approved_titles / totals.titles_submitted
    },
    published: {
      value: `${totals.titles_published} / ${totals.titles_submitted}`,
      explanation: `${totals.titles_published} submitted titles have at least one storefront publication event.`,
      share: totals.titles_published / totals.titles_submitted
    },
    attempts: {
      value: `${totals.submission_attempts - totals.titles_submitted} repeats`,
      explanation: `${totals.submission_attempts - totals.titles_submitted} of ${totals.submission_attempts} review attempts came after a title's first attempt.`,
      share: (totals.submission_attempts - totals.titles_submitted) / totals.submission_attempts
    }
  };
  const buttons = document.querySelectorAll('[data-signal]');
  function select(key) {
    const signal = signals[key];
    $('#signal-value').textContent = signal.value;
    $('#signal-explanation').textContent = signal.explanation;
    $('#signal-meter-fill').style.width = `${signal.share * 100}%`;
    buttons.forEach((button) => {
      const active = button.dataset.signal === key;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  buttons.forEach((button) => button.addEventListener('click', () => select(button.dataset.signal)));
  select('approval');
}

function setupMathExplorer(totals) {
  const submitted = $('#submitted-range');
  const approved = $('#approved-range');
  submitted.max = String(Math.max(12, totals.titles_submitted * 2));
  submitted.value = String(totals.titles_submitted);
  approved.value = String(totals.first_pass_approved_titles);
  function render() {
    const denominator = Number(submitted.value);
    approved.max = String(denominator);
    if (Number(approved.value) > denominator) approved.value = String(denominator);
    const numerator = Number(approved.value);
    const share = numerator / denominator;
    $('#submitted-output').textContent = denominator;
    $('#approved-output').textContent = numerator;
    $('#math-result').textContent = `${numerator} / ${denominator} = ${formatPercent(share * 100)}`;
    $('#math-meter-fill').style.width = `${share * 100}%`;
  }
  $('#math-baseline').textContent = `${totals.first_pass_approved_titles} / ${totals.titles_submitted} = ${formatPercent(totals.first_pass_approval_pct)}`;
  submitted.addEventListener('input', render);
  approved.addEventListener('input', render);
  render();
}

function setupFanoutExplorer() {
  const buttons = document.querySelectorAll('[data-fanout]');
  const rows = $('#fanout-rows');
  buttons.forEach((button) => button.addEventListener('click', () => {
    const raw = button.dataset.fanout === 'raw';
    $('#fanout-caption').textContent = raw
      ? 'Raw join: 2 review rows × 2 storefront rows = 4 rows for one title. A KPI can quietly double.'
      : 'Aggregate each stream first: one title outcome row.';
    rows.replaceChildren(...Array.from({length: raw ? 4 : 1}, () => document.createElement('i')));
    rows.classList.toggle('is-raw', raw);
    buttons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
  }));
}

function setProof(snippet, key) {
  $('#proof-file').textContent = snippet.filename;
  $('#proof-lang').textContent = snippet.language.toUpperCase();
  $('#proof-code').textContent = snippet.code;
  $('#proof-description').textContent = snippet.description;
  $('#proof-link').href = snippet.link;
  document.querySelectorAll('[data-proof]').forEach((button) => {
    const active = button.dataset.proof === key;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

async function setupCodeInspector() {
  const snippets = await loadJSON('assets/snippets.json');
  setProof(snippets.mart, 'mart');
  document.querySelectorAll('[data-proof]').forEach((button) => {
    button.addEventListener('click', () => setProof(snippets[button.dataset.proof], button.dataset.proof));
  });
  const dialog = $('#code-dialog');
  document.querySelectorAll('[data-snippet]').forEach((button) => {
    button.addEventListener('click', () => {
      const snippet = snippets[button.dataset.snippet];
      if (!snippet) return;
      $('#dialog-title').textContent = snippet.title;
      $('#dialog-description').textContent = snippet.description;
      $('#dialog-file').textContent = snippet.filename;
      $('#dialog-language').textContent = snippet.language.toUpperCase();
      $('#dialog-code').textContent = snippet.code;
      $('#dialog-link').href = snippet.link;
      dialog.showModal();
    });
  });
  $('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function setupTrailer() {
  const games = {
    wilds: {
      title: 'Monster Hunter Wilds',
      context: 'I have put 750 hours into Wilds. That may help one retention curve, but it is still one player, not a dataset. The NEXUS reference contains no real game or partner records.',
      page: 'https://www.playstation.com/en-gb/games/monster-hunter-wilds/',
      poster: 'assets/monster-hunter-wilds-keyart.jpg',
      video: 'a_wNFT4j6qI',
      provider: 'OFFICIAL MONSTER HUNTER TRAILER ↗',
      credit: 'Monster Hunter’s official launch trailer',
      videoTitle: 'Monster Hunter Wilds official launch trailer'
    },
    revelation: {
      title: 'Final Fantasy VII Revelation',
      context: 'An announced chapter makes release readiness especially visible. Here it is an editorial example; the dbt records remain fictional.',
      page: 'https://www.playstation.com/en-us/games/final-fantasy-vii-revelation/',
      poster: 'assets/ff7-revelation-hero.jpg',
      video: '8JszLth0_Gc',
      provider: 'OFFICIAL PLAYSTATION TRAILER ↗',
      credit: 'PlayStation’s official announcement trailer',
      videoTitle: 'Final Fantasy VII Revelation official announcement trailer'
    },
    persona: {
      title: 'Persona 6',
      context: 'An announced title with a release date still to be determined. A partner data product should make that uncertainty explicit, never quietly fill a blank.',
      page: 'https://store.playstation.com/en-us/concept/10009619/',
      poster: 'assets/persona-6-hero.jpg',
      video: 'CL-q0HgfMOY',
      provider: 'OFFICIAL ATLUS TRAILER ↗',
      credit: 'ATLUS West’s official teaser trailer',
      videoTitle: 'Persona 6 official teaser trailer'
    },
    veronica: {
      title: 'Resident Evil Veronica',
      context: 'A 2027 game announcement offers a very different visual tone. The publishing questions beneath it still need the same careful grains and status definitions.',
      page: 'https://www.playstation.com/en-us/games/resident-evil-veronica/',
      poster: 'assets/resident-evil-veronica-cover.jpg',
      video: 'S4msqGQxSAg',
      provider: 'OFFICIAL PLAYSTATION TRAILER ↗',
      credit: 'PlayStation’s official announcement trailer',
      videoTitle: 'Resident Evil Veronica official announcement trailer'
    }
  };
  let selected = games.wilds;
  const frame = $('#trailer-frame');
  const play = $('#trailer-play');
  document.querySelectorAll('[data-game]').forEach((button) => {
    button.addEventListener('click', () => {
      selected = games[button.dataset.game];
      document.querySelectorAll('[data-game]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      $('#selected-game-title').textContent = selected.title;
      $('#selected-game-context').textContent = selected.context;
      $('#selected-game-link').href = selected.page;
      $('#trailer-provider').textContent = selected.provider;
      $('#trailer-credit-link').textContent = selected.credit;
      $('#trailer-credit-link').href = `https://www.youtube.com/watch?v=${selected.video}`;
      play.setAttribute('aria-label', `Play ${selected.videoTitle}`);
      play.querySelector('span:last-child').textContent = 'Play official trailer';
      frame.style.backgroundImage = `linear-gradient(90deg,rgba(3,10,16,.28),rgba(3,10,16,.14)),url("${selected.poster}")`;
      frame.replaceChildren(play);
    });
  });
  play.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${selected.video}?autoplay=1&rel=0`;
    iframe.title = selected.videoTitle;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    frame.replaceChildren(iframe);
  });
}

setupTrailer();
setupFanoutExplorer();
setupMetrics().catch(() => {
  $('#partner-list').textContent = 'Model output could not load. Open the repository for the synthetic data.';
});
setupCodeInspector().catch(() => {
  $('#proof-code').textContent = 'Code preview could not load. Open the repository to inspect the source.';
});
