const $ = (selector) => document.querySelector(selector);
let activeGameKey = 'wilds';
let chartMetrics = null;

const gameStories = {
  wilds: {
    question: 'Could a review delay change a partner’s plan?',
    questionDetail: 'A new game moment makes turnaround visible. Which submissions took longer, and what was knowable when they arrived?',
    measure: 'Review time → earlier history',
    measureDetail: 'Read each fictional review event, then separate prior partner history from the duration observed later.',
    decision: 'Plan follow-up sooner.',
    decisionDetail: 'Point-in-time history could support a future turnaround estimate. This reference does not train a model.',
    charts: ['speed'],
    value: (data) => `${data.review_events.length} synthetic review events`
  },
  revelation: {
    question: 'Is approved the same as available?',
    questionDetail: 'Release readiness needs two clocks: review completion and actual storefront publication.',
    measure: 'Coverage + handoff time',
    measureDetail: 'Count fictional published titles separately from approved reviews; then inspect the time between them.',
    decision: 'Spot the missing handoff.',
    decisionDetail: 'A partner team could follow up on approved work that has not yet appeared in a storefront.',
    charts: ['publication', 'handoff'],
    value: (data) => `${data.totals.titles_published} / ${data.totals.titles_submitted} fictional titles published`
  },
  persona: {
    question: 'What stays a plan until it happens?',
    questionDetail: 'An announced date and an actual storefront publication answer different questions.',
    measure: 'Planned date ≠ publication',
    measureDetail: 'The fictional model keeps planned release dates separate from first publication timestamps.',
    decision: 'Keep uncertainty visible.',
    decisionDetail: 'Stakeholders can distinguish a known publication from a date that still needs confirmation.',
    charts: ['publication'],
    value: (data) => `${data.totals.titles_published} observed publications in the fictional titles`
  },
  veronica: {
    question: 'Where does a review loop repeat?',
    questionDetail: 'A total of review attempts hides whether a title cleared first time or needed another pass.',
    measure: 'First-pass quality + retries',
    measureDetail: 'Keep first attempts and repeat attempts separate at title grain.',
    decision: 'Investigate friction, not blame.',
    decisionDetail: 'A repeated attempt is a useful prompt to inspect status history before claiming a cause.',
    charts: ['quality', 'retries'],
    value: (data) => `${data.totals.submission_attempts - data.totals.titles_submitted} repeats in ${data.totals.submission_attempts} fictional attempts`
  }
};

function renderGameStory() {
  const story = gameStories[activeGameKey];
  const bridge = $('#story-bridge');
  $('#featured-game').dataset.world = activeGameKey;
  $('#story-world').textContent = $('#selected-game-title').textContent;
  $('#story-question').textContent = story.question;
  $('#story-question-detail').textContent = story.questionDetail;
  $('#story-measure').textContent = story.measure;
  $('#story-measure-detail').textContent = story.measureDetail;
  $('#story-decision').textContent = story.decision;
  $('#story-decision-detail').textContent = story.decisionDetail;
  $('#story-value').textContent = chartMetrics ? story.value(chartMetrics) : 'Loading the synthetic dbt result…';
  document.querySelectorAll('[data-chart]').forEach((card) => card.classList.toggle('is-story-focus', story.charts.includes(card.dataset.chart)));
  bridge.classList.remove('is-entering');
  void bridge.offsetWidth;
  bridge.classList.add('is-entering');
}

async function loadJSON(path) {
  const response = await fetch(path, {cache: 'no-store'});
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
  setupCharts(data);
}

function setupCharts(data) {
  const partners = data.partners;
  const totals = data.totals;
  const safe = (value) => String(value).replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const percent = (part, whole) => whole ? Math.min(100, Math.max(0, part / whole * 100)) : 0;
  const barRows = partners.map((partner) => `<div class="chart-bar-row"><span>${safe(partner.partner_name)}</span><div class="chart-bar-track" aria-hidden="true"><i style="--bar-width:${percent(partner.first_pass_approved_titles, partner.titles_submitted)}%"></i></div><strong>${formatPercent(partner.first_pass_approval_pct)}</strong></div>`).join('');
  const firstAttempts = totals.titles_submitted;
  const repeatAttempts = totals.submission_attempts - firstAttempts;
  const publishedShare = percent(totals.titles_published, totals.titles_submitted);
  const reviewEvents = data.review_events || [];
  const d3lib = window.d3;
  const reviewX = d3lib ? d3lib.scaleLinear().domain([0, Math.max(1, reviewEvents.length - 1)]).range([52, 558]) : (index) => 52 + index * 506 / Math.max(1, reviewEvents.length - 1);
  const reviewY = d3lib ? d3lib.scaleLinear().domain([0, 50]).range([151, 31]) : (hours) => 151 - Number(hours) / 50 * 120;
  const reviewPlot = reviewEvents.map((event, index) => ({
    x: reviewX(index),
    y: reviewY(Number(event.review_hours)),
    event
  }));
  const reviewCurve = d3lib?.curveCatmullRom.alpha(0.45);
  const reviewLine = d3lib
    ? d3lib.line().x((event, index) => reviewX(index)).y((event) => reviewY(Number(event.review_hours))).curve(reviewCurve)(reviewEvents)
    : reviewPlot.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const reviewArea = d3lib
    ? d3lib.area().x((event, index) => reviewX(index)).y0(reviewY(0)).y1((event) => reviewY(Number(event.review_hours))).curve(reviewCurve)(reviewEvents)
    : reviewPlot.length ? `${reviewLine} L ${reviewPlot.at(-1).x.toFixed(1)} 151 L ${reviewPlot[0].x.toFixed(1)} 151 Z` : '';
  const reviewPoints = reviewPlot.map((point, index) => `<button type="button" class="review-point${index === 6 ? ' is-selected' : ''}" data-review-index="${index}" data-status="${safe(point.event.status)}" style="--point-left:${(point.x / 600 * 100).toFixed(2)}%;--point-top:${(point.y / 180 * 100).toFixed(2)}%;--point-delay:${(index * 105 + 250)}ms" aria-label="${safe(point.event.submission_id)}: ${safe(point.event.review_hours)} hours, ${safe(point.event.status)}" aria-pressed="${index === 6}"></button>`).join('');
  const maxLead = Math.max(...partners.map((partner) => Number(partner.avg_publication_lead_days)), 1);
  const leadColumns = partners.map((partner) => `<div class="chart-column"><strong>${safe(partner.avg_publication_lead_days)}d</strong><div class="chart-column-track" aria-hidden="true"><i style="--column-height:${percent(partner.avg_publication_lead_days, maxLead)}%"></i></div><span>${safe(partner.partner_name)}</span></div>`).join('');
  $('#partner-charts').innerHTML = `
    <article class="chart-card" data-chart="quality"><span class="chart-number">01 / QUALITY</span><h4>First-pass approval</h4><p>Where a title clears review without a second attempt.</p><div class="chart-bars">${barRows}</div><small>Approved on attempt one ÷ submitted titles</small></article>
    <article class="chart-card" data-chart="retries"><span class="chart-number">02 / RETRIES</span><h4>Review effort</h4><p>Repeat attempts are visible, rather than hidden in a total.</p><div class="chart-mix"><div class="chart-mix-total"><strong>${totals.submission_attempts}</strong><span>review attempts</span></div><div class="chart-mix-track" aria-hidden="true"><i class="chart-mix-first" style="--mix-width:${percent(firstAttempts, totals.submission_attempts)}%"></i><i class="chart-mix-repeat" style="--mix-width:${percent(repeatAttempts, totals.submission_attempts)}%"></i></div><div class="chart-mix-key"><span><b></b>${firstAttempts} first attempts</span><span><b></b>${repeatAttempts} repeats</span></div></div><small>One first attempt per submitted title</small></article>
    <article class="chart-card" data-chart="publication"><span class="chart-number">03 / PUBLICATION</span><h4>Storefront coverage</h4><p>Publication is a separate event from approval.</p><div class="chart-ring-wrap"><svg class="chart-ring" viewBox="0 0 160 160" aria-hidden="true"><circle class="chart-ring-track" cx="80" cy="80" r="60" pathLength="100"/><circle class="chart-ring-fill" cx="80" cy="80" r="60" pathLength="100" style="--ring-end:${100 - publishedShare}"/></svg><div class="chart-ring-label"><strong>${totals.titles_published} / ${totals.titles_submitted}</strong><span>titles published</span></div></div><small>Published titles ÷ submitted titles</small></article>
    <article class="chart-card chart-card-wide review-card" data-chart="speed"><div class="review-heading"><div><span class="chart-number">04 / SPEED → FEATURES</span><h4>Review time, event by event.</h4><p>Completed review hours in submission order. Select a signal to see what was knowable when it arrived.</p></div><span class="review-count">${reviewEvents.length} synthetic events</span></div><div class="review-layout"><div><div class="review-graph" role="group" aria-label="Review duration by submission order"><svg viewBox="0 0 600 180" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="review-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f0c878" stop-opacity=".38"/><stop offset="100%" stop-color="#78b9f5" stop-opacity="0"/></linearGradient><linearGradient id="review-line-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#77b9f5"/><stop offset="55%" stop-color="#b3d9ff"/><stop offset="100%" stop-color="#f1cb7c"/></linearGradient></defs><path class="review-gridline" d="M 52 31 H 558 M 52 91 H 558 M 52 151 H 558"/><text x="5" y="35">50h</text><text x="5" y="95">25h</text><text x="12" y="155">0h</text><path class="review-area" d="${reviewArea}"/><path class="review-trace" d="${reviewLine}" pathLength="100"/></svg>${reviewPoints}</div><div class="review-axis"><span>Earlier submissions</span><span>Later submissions →</span></div><div class="review-legend"><span><i class="review-legend-approved"></i>Approved</span><span><i class="review-legend-rejected"></i>Rejected</span><span>Point height = observed review hours</span></div></div><div class="review-feature-panel" aria-live="polite"><span class="review-panel-kicker">POINT-IN-TIME FEATURE VIEW</span><div class="review-panel-title"><strong id="review-selected-name"></strong><span id="review-selected-status"></span></div><small id="review-selected-meta"></small><div class="review-feature-grid"><div><span>Prior completed reviews</span><strong id="review-prior-count"></strong></div><div><span>Prior mean review time</span><strong id="review-prior-mean"></strong></div><div><span>Current attempt</span><strong id="review-attempt"></strong></div><div class="review-observed"><span>Observed later · label</span><strong id="review-observed"></strong></div></div><div class="review-use"><span>POTENTIAL USE</span><strong>Estimate review turnaround earlier so partner teams can plan follow-up.</strong></div><p>Prior history could become features; current review duration is the later label, never an input at submission.</p><a href="https://github.com/rfim/nexus-playstation-partners/blob/main/models/intermediate/int_partner_review_features.sql" target="_blank" rel="noopener noreferrer">Inspect point-in-time SQL ↗</a></div></div><small>Synthetic portfolio example · no model was trained and no PlayStation records are used.</small></article>
    <article class="chart-card chart-card-wide" data-chart="handoff"><span class="chart-number">05 / HANDOFF</span><h4>Publication lead time</h4><p>Mean days from approved review to storefront publication.</p><div class="chart-columns">${leadColumns}</div><small>Only published titles contribute to each partner mean</small></article>`;
  const reviewCard = $('.review-card');
  const partnerNames = new Map(partners.map((partner) => [partner.partner_id, partner.partner_name]));
  function selectReview(index) {
    const event = reviewEvents[index];
    if (!event) return;
    reviewCard.querySelectorAll('.review-point').forEach((button) => {
      const selected = Number(button.dataset.reviewIndex) === index;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('#review-selected-name').textContent = partnerNames.get(event.partner_id) || event.partner_id;
    $('#review-selected-status').textContent = event.status;
    $('#review-selected-status').dataset.status = event.status;
    $('#review-selected-meta').textContent = `${event.submission_id} · ${event.submitted_at.slice(0, 10)} · title ${event.title_id}`;
    $('#review-prior-count').textContent = event.prior_partner_review_count;
    $('#review-prior-mean').textContent = event.prior_partner_avg_review_hours == null ? 'No history' : `${event.prior_partner_avg_review_hours}h`;
    $('#review-attempt').textContent = `#${event.attempt_number}`;
    $('#review-observed').textContent = `${event.review_hours}h`;
  }
  reviewCard.querySelectorAll('.review-point').forEach((button) => {
    button.addEventListener('click', () => selectReview(Number(button.dataset.reviewIndex)));
    button.addEventListener('focus', () => selectReview(Number(button.dataset.reviewIndex)));
  });
  selectReview(Math.min(6, reviewEvents.length - 1));
  chartMetrics = data;
  renderGameStory();
  function animateReviewGraph() {
    if (!d3lib || !reviewEvents.length) return;
    const graph = reviewCard.querySelector('.review-graph');
    graph.classList.add('has-d3');
    const trace = d3lib.select(graph.querySelector('.review-trace'));
    const area = d3lib.select(graph.querySelector('.review-area'));
    const length = trace.node().getTotalLength();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    trace.interrupt().style('stroke-dasharray', `${length} ${length}`).style('stroke-dashoffset', reducedMotion ? 0 : length);
    area.interrupt().style('opacity', reducedMotion ? 1 : 0);
    if (!reducedMotion) {
      trace.transition().duration(1800).ease(d3lib.easeCubicOut).style('stroke-dashoffset', 0);
      area.transition().delay(350).duration(1000).style('opacity', 1);
    }
  }
  const suite = $('#chart-suite');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        suite.classList.add('is-visible');
        animateReviewGraph();
        observer.disconnect();
      }
    }, {threshold: 0.12});
    observer.observe(suite);
  } else {
    suite.classList.add('is-visible');
    animateReviewGraph();
  }
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
    replayRoute();
  }
  buttons.forEach((button) => button.addEventListener('click', () => select(button.dataset.signal)));
  select('approval');
}

function replayRoute() {
  const route = $('#route-console');
  const stages = $('.map-stages');
  route.classList.remove('is-replaying');
  stages.classList.remove('is-replaying');
  void route.offsetWidth;
  route.classList.add('is-replaying');
  stages.classList.add('is-replaying');
}

function setupRoute() {
  $('#route-replay').addEventListener('click', replayRoute);
  $('.map-accordion').addEventListener('toggle', (event) => {
    if (event.currentTarget.open) replayRoute();
  });
  replayRoute();
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
      title: 'Monster Hunter Wilds: Ascendance',
      context: 'After 750 hours in Wilds, Ascendance is a useful reminder that one player’s enthusiasm is not a retention metric. The NEXUS reference contains no real game or partner records.',
      page: 'https://blog.playstation.com/2026/09/03/monster-hunter-wilds-ascendance-reveals-new-monsters-story-details-and-gameplay',
      poster: 'assets/monster-hunter-ascendance-art.png',
      video: 'SodbU0PEVH4',
      provider: 'OFFICIAL ASCENDANCE TRAILER ↗',
      credit: 'PlayStation’s official Ascendance trailer',
      videoTitle: 'Monster Hunter Wilds: Ascendance official trailer'
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
      activeGameKey = button.dataset.game;
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
      renderGameStory();
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
  renderGameStory();
}

setupTrailer();
setupRoute();
setupFanoutExplorer();
setupMetrics().catch(() => {
  $('#partner-list').textContent = 'Model output could not load. Open the repository for the synthetic data.';
});
setupCodeInspector().catch(() => {
  $('#proof-code').textContent = 'Code preview could not load. Open the repository to inspect the source.';
});
