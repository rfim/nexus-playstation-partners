const $ = (selector) => document.querySelector(selector);
let activeGameKey = 'wilds';
let chartMetrics = null;
let replayPublicationChart = () => {};
let replayReviewChart = () => {};
let replayLeadChart = () => {};
let replayCausalChart = () => {};
let activeSupportingChart = 'causal';

const chartOrder = ['quality', 'causal', 'publication', 'speed', 'handoff'];

const chartSlideLabels = {
  quality: '01 · First-pass',
  causal: '02 · Causal check',
  publication: '03 · Publication',
  speed: '04 · Review time',
  handoff: '05 · Lead time'
};

const gameStories = {
  wilds: {
    question: 'Did titles clear review on the first attempt?',
    questionDetail: 'A launch moment needs a clean answer: how many distinct titles passed without another review loop?',
    measure: 'First-pass approval at title grain',
    measureDetail: 'One title contributes once, even when its submission has multiple attempts.',
    decision: 'Review the friction.',
    decisionDetail: 'Compare partners with more repeats, then inspect review history before assuming a cause.',
    charts: ['quality', 'speed'],
    featureChart: 'quality',
    featureTitle: 'Did the title clear review first time?',
    featureContext: 'The first checkpoint is quality at title grain. A second attempt changes the first-pass measure; it does not create another title.',
    value: (data) => `${data.totals.first_pass_approved_titles} of ${data.totals.titles_submitted} fictional titles cleared first time`
  },
  revelation: {
    question: 'Is approved the same as available?',
    questionDetail: 'Release readiness needs two clocks: review completion and actual storefront publication.',
    measure: 'Coverage + handoff time',
    measureDetail: 'Count fictional published titles separately from approved reviews; then inspect the time between them.',
    decision: 'Spot the missing handoff.',
    decisionDetail: 'A partner team could follow up on approved work that has not yet appeared in a storefront.',
    charts: ['publication', 'handoff'],
    featureChart: 'publication',
    featureTitle: 'Approval is not a storefront event.',
    featureContext: 'Follow each approved fictional title to its first observed publication. The gaps in the chart are questions for the handoff, not invented zeros.',
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
    featureChart: 'publication',
    featureTitle: 'When did a plan become observable?',
    featureContext: 'Use a real publication event for availability. A planned date is a different field and cannot fill a missing storefront timestamp.',
    value: (data) => `${data.totals.titles_published} observed publications in the fictional titles`
  },
  veronica: {
    question: 'Where does a review loop repeat?',
    questionDetail: 'A total of review attempts hides whether a title cleared first time or needed another pass.',
    measure: 'Review events and attempt order',
    measureDetail: 'Select a submission to see its attempt number, review status and completed duration.',
    decision: 'Investigate friction, not blame.',
    decisionDetail: 'A repeated attempt is a useful prompt to inspect status history before claiming a cause.',
    charts: ['speed', 'quality'],
    featureChart: 'speed',
    featureTitle: 'Where did the review loop repeat?',
    featureContext: 'Follow individual review events and their attempt numbers. The point-in-time view separates what was known at submission from the review outcome.',
    value: (data) => `${data.totals.submission_attempts - data.totals.titles_submitted} repeats in ${data.totals.submission_attempts} fictional attempts`
  }
};

function showChartSlide(key) {
  const cards = [...$('#partner-charts').querySelectorAll('.chart-card')];
  const index = cards.findIndex((card) => card.dataset.chart === key);
  if (index < 0) return;
  activeSupportingChart = key;
  cards.forEach((card) => {
    const active = card.dataset.chart === key;
    card.hidden = !active;
    card.classList.toggle('is-active-slide', active);
  });
  $('#chart-slide-tabs').querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.chart === key));
  });
  $('#chart-slide-status').textContent = `${index + 1} of ${cards.length}`;
  $('#chart-slide-prev').disabled = index === 0;
  $('#chart-slide-next').disabled = index === cards.length - 1;
  if ($('#chart-suite').classList.contains('is-visible')) {
    if (key === 'publication') replayPublicationChart();
    if (key === 'speed') replayReviewChart();
    if (key === 'handoff') replayLeadChart();
    if (key === 'causal') replayCausalChart();
  }
}

function renderChartSlideControls() {
  const cards = [...$('#partner-charts').querySelectorAll('.chart-card')];
  if (!cards.length) return;
  const tabs = $('#chart-slide-tabs');
  tabs.replaceChildren();
  cards.forEach((card) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.chart = card.dataset.chart;
    button.textContent = chartSlideLabels[card.dataset.chart];
    button.setAttribute('aria-controls', 'partner-charts');
    button.addEventListener('click', () => showChartSlide(card.dataset.chart));
    tabs.append(button);
  });
  $('#chart-slide-controls').hidden = false;
  if (!cards.some((card) => card.dataset.chart === activeSupportingChart)) activeSupportingChart = cards[0].dataset.chart;
  showChartSlide(activeSupportingChart);
}

function setupChartSlides() {
  function move(direction) {
    const cards = [...$('#partner-charts').querySelectorAll('.chart-card')];
    const index = cards.findIndex((card) => card.dataset.chart === activeSupportingChart);
    const next = cards[index + direction];
    if (next) showChartSlide(next.dataset.chart);
  }
  $('#chart-slide-prev').addEventListener('click', () => move(-1));
  $('#chart-slide-next').addEventListener('click', () => move(1));
}

function renderGameStory() {
  const story = gameStories[activeGameKey];
  const bridge = $('#story-bridge');
  $('#featured-game').dataset.world = activeGameKey;
  $('#story-world').textContent = document.querySelector(`[data-game="${activeGameKey}"] strong`).textContent;
  $('#story-question').textContent = story.question;
  $('#story-question-detail').textContent = story.questionDetail;
  $('#story-measure').textContent = story.measure;
  $('#story-measure-detail').textContent = story.measureDetail;
  $('#story-decision').textContent = story.decision;
  $('#story-decision-detail').textContent = story.decisionDetail;
  $('#story-value').textContent = chartMetrics ? story.value(chartMetrics) : 'Loading the synthetic dbt result…';
  $('#featured-dashboard-kicker').textContent = `THE FIRST SIGNAL · ${story.featureChart === 'quality' ? '01 / QUALITY' : story.featureChart === 'speed' ? '04 / SPEED' : '03 / PUBLICATION'}`;
  $('#featured-dashboard-title').textContent = story.featureTitle;
  $('#featured-dashboard-context').textContent = story.featureContext;
  const slot = $('#featured-dashboard-slot');
  const grid = $('#partner-charts');
  if (chartMetrics) {
    const current = slot.querySelector('.chart-card');
    if (current) grid.append(current);
    const selected = grid.querySelector(`[data-chart="${story.featureChart}"]`);
    if (selected) {
      selected.hidden = false;
      selected.classList.remove('is-active-slide');
      slot.replaceChildren(selected);
    }
    [...grid.querySelectorAll('.chart-card')].sort((a, b) => Number(a.dataset.chartOrder) - Number(b.dataset.chartOrder)).forEach((card) => grid.append(card));
    renderChartSlideControls();
    if (story.featureChart === 'publication' && $('#featured-dashboard').classList.contains('is-visible')) replayPublicationChart();
    if (story.featureChart === 'speed' && $('#featured-dashboard').classList.contains('is-visible')) replayReviewChart();
  }
  document.querySelectorAll('.chart-card[data-chart]').forEach((card) => card.classList.toggle('is-story-focus', story.charts.includes(card.dataset.chart)));
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
  const reviewEvents = data.review_events || [];
  const publicationEvents = data.publication_events || [];
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
  $('#partner-charts').innerHTML = `
    <article class="chart-card" data-chart="quality"><span class="chart-number">01 / QUALITY</span><h4>First-pass approval</h4><p>Where a title clears review without a second attempt.</p><div class="chart-bars">${barRows}</div><small>Approved on attempt one ÷ submitted titles</small></article>
    <article class="chart-card chart-card-wide publication-card" data-chart="publication"><div class="review-heading"><div><span class="chart-number">03 / PUBLICATION → FEATURES</span><h4>From approval to storefront.</h4><p>Each line starts when a fictional title was approved and ends at its first observed publication. Select a title to inspect what was known at approval.</p></div><span class="review-count">${totals.titles_published} of ${totals.titles_submitted} observed</span></div><div class="publication-layout"><div><div class="publication-graph"><svg id="publication-svg" viewBox="0 0 680 300" role="img" aria-label="Hours from title approval to first observed storefront publication"></svg></div><div class="publication-legend"><span><i></i>Observed publication</span><span><i></i>No publication event observed is unknown, not zero</span></div><div id="publication-selectors" class="publication-selectors" role="group" aria-label="Inspect a fictional title"></div></div><div class="review-feature-panel publication-feature-panel" aria-live="polite"><span class="review-panel-kicker">POINT-IN-TIME PUBLICATION VIEW</span><div class="review-panel-title"><strong id="publication-selected-name"></strong><span id="publication-selected-status"></span></div><small id="publication-selected-meta"></small><div class="review-feature-grid"><div><span>Prior partner publications</span><strong id="publication-prior-count"></strong></div><div><span>Prior mean handoff</span><strong id="publication-prior-mean"></strong></div><div><span>Approval attempt</span><strong id="publication-attempt"></strong></div><div class="review-observed"><span>Observed later · outcome</span><strong id="publication-observed"></strong></div></div><div class="review-use"><span>POTENTIAL USE</span><strong>Use past handoffs to plan a follow-up window after approval.</strong></div><p>History is restricted to publications before this approval. The selected title’s later storefront event is an outcome, never an input feature. No prediction model was trained.</p><a href="https://github.com/rfim/nexus-playstation-partners/blob/main/models/intermediate/int_title_publication_features.sql" target="_blank" rel="noopener noreferrer">Inspect point-in-time SQL ↗</a></div></div><small>Synthetic title events · elapsed hours only for observed publications · no PlayStation records.</small></article>
    <article class="chart-card chart-card-wide review-card" data-chart="speed"><div class="review-heading"><div><span class="chart-number">04 / SPEED → FEATURES</span><h4>Review time, event by event.</h4><p>Completed review hours in submission order. Select a signal to see what was knowable when it arrived.</p></div><span class="review-count">${reviewEvents.length} synthetic events</span></div><div class="review-layout"><div><div class="review-graph" role="group" aria-label="Review duration by submission order"><svg viewBox="0 0 600 180" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="review-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f0c878" stop-opacity=".38"/><stop offset="100%" stop-color="#78b9f5" stop-opacity="0"/></linearGradient><linearGradient id="review-line-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#77b9f5"/><stop offset="55%" stop-color="#b3d9ff"/><stop offset="100%" stop-color="#f1cb7c"/></linearGradient></defs><path class="review-gridline" d="M 52 31 H 558 M 52 91 H 558 M 52 151 H 558"/><text x="5" y="35">50h</text><text x="5" y="95">25h</text><text x="12" y="155">0h</text><path class="review-area" d="${reviewArea}"/><path class="review-trace" d="${reviewLine}" pathLength="100"/></svg>${reviewPoints}</div><div class="review-axis"><span>Earlier submissions</span><span>Later submissions →</span></div><div class="review-legend"><span><i class="review-legend-approved"></i>Approved</span><span><i class="review-legend-rejected"></i>Rejected</span><span>Point height = observed review hours</span></div></div><div class="review-feature-panel" aria-live="polite"><span class="review-panel-kicker">POINT-IN-TIME FEATURE VIEW</span><div class="review-panel-title"><strong id="review-selected-name"></strong><span id="review-selected-status"></span></div><small id="review-selected-meta"></small><div class="review-feature-grid"><div><span>Prior completed reviews</span><strong id="review-prior-count"></strong></div><div><span>Prior mean review time</span><strong id="review-prior-mean"></strong></div><div><span>Current attempt</span><strong id="review-attempt"></strong></div><div class="review-observed"><span>Observed later · label</span><strong id="review-observed"></strong></div></div><div class="review-use"><span>POTENTIAL USE</span><strong>Estimate review turnaround earlier so partner teams can plan follow-up.</strong></div><p>Prior history could become features; current review duration is the later label, never an input at submission.</p><a href="https://github.com/rfim/nexus-playstation-partners/blob/main/models/intermediate/int_partner_review_features.sql" target="_blank" rel="noopener noreferrer">Inspect point-in-time SQL ↗</a></div></div><small>Synthetic portfolio example · no model was trained and no PlayStation records are used.</small></article>
    <article class="chart-card chart-card-wide lead-card" data-chart="handoff"><div class="review-heading"><div><span class="chart-number">05 / LEAD TIME → FEATURES</span><h4>From first submission to storefront.</h4><p>Each dot is one fictional title with an observed publication. The diamond is its partner mean. Select a title to see what was known when it was first submitted.</p></div><span class="review-count">${totals.titles_published} observed · ${totals.titles_submitted - totals.titles_published} not observed</span></div><div class="lead-layout"><div><div class="lead-graph"><svg id="lead-svg" viewBox="0 0 680 300" role="img" aria-label="Publication lead days by partner and fictional title"></svg></div><div class="lead-legend"><span><i class="lead-legend-dot"></i>Published title</span><span><i class="lead-legend-mean"></i>Partner mean</span><span>Titles without an observed publication are excluded from the mean.</span></div><div id="lead-selectors" class="lead-selectors" role="group" aria-label="Inspect a fictional title's lead time"></div></div><div class="review-feature-panel lead-feature-panel" aria-live="polite"><span class="review-panel-kicker">POINT-IN-TIME LEAD VIEW</span><div class="review-panel-title"><strong id="lead-selected-name"></strong><span id="lead-selected-status"></span></div><small id="lead-selected-meta"></small><div class="review-feature-grid"><div><span>Earlier partner publications</span><strong id="lead-prior-count"></strong></div><div><span>Earlier mean lead time</span><strong id="lead-prior-mean"></strong></div><div><span>Planned release</span><strong id="lead-planned-date"></strong></div><div class="review-observed"><span>Observed later · outcome</span><strong id="lead-observed"></strong></div></div><div class="review-use"><span>POTENTIAL USE</span><strong>Compare delivery variation before agreeing a follow-up window.</strong></div><p>Prior history ends before the selected title's first submission. Its own storefront lead time is shown as a later outcome, never an input feature.</p><a href="https://github.com/rfim/nexus-playstation-partners/blob/main/models/intermediate/int_title_publication_features.sql" target="_blank" rel="noopener noreferrer">Inspect point-in-time SQL ↗</a></div></div><small>First submission → first observed publication · only published titles enter each partner mean · synthetic data.</small></article>`;
  $('#partner-charts').insertAdjacentHTML('beforeend', `
    <article class="chart-card chart-card-wide causal-card" data-chart="causal">
      <div class="review-heading"><div><span class="chart-number">02 / CAUSAL DESIGN · ILLUSTRATIVE</span><h4>Did the workflow change the outcome?</h4><p>A before/after rise is only a start. Compare a treated cohort with one not exposed to the workflow, then ask whether the counterfactual is credible.</p></div><span class="review-count">Hypothetical rates</span></div>
      <div class="causal-layout"><div><div class="causal-graph"><svg id="causal-svg" viewBox="0 0 680 300" role="img" aria-label="Illustrative eight-week first-pass approval rates for treated and comparison cohorts, with a post-change counterfactual"></svg></div><div class="causal-legend"><span><i class="causal-key-treated"></i>Workflow changed</span><span><i class="causal-key-control"></i>Comparison</span><span><i class="causal-key-counterfactual"></i>Counterfactual under parallel trends</span></div></div>
      <div class="causal-rigor"><span class="review-panel-kicker">THE ESTIMATE IS CONDITIONAL</span><strong id="causal-estimate">+12 pp</strong><p id="causal-decomposition">Treated +18 pp − comparison +6 pp</p><div class="causal-check"><b>01 · Design</b><span>Define rollout unit, eligible population and outcome before looking at the result. Check whether partner teams influence one another: spillovers break the no-interference assumption.</span></div><div class="causal-check"><b>02 · Diagnose</b><span>Check pre-trends, changing mix, placebo dates and simultaneous changes. Similar pre-trends do not prove the assumption. <span id="causal-placebo"></span></span></div><div class="causal-check"><b>03 · Sensitivity</b><span id="causal-sensitivity">A 1 pp/week untreated drift would change the illustrative estimate.</span></div><div class="causal-check"><b>04 · Infer</b><span>With real unit-level data, report cluster-aware uncertainty and sensitivity to trend violations. The weekly rates lack denominators and unit-level variation, so no standard error or valid confidence interval can be calculated.</span></div><a href="#math">Inspect the equation ↓</a><a href="https://github.com/rfim/nexus-playstation-partners/blob/main/models/marts/mart_workflow_did_demo.sql" target="_blank" rel="noopener noreferrer">Inspect the dbt calculation ↗</a></div></div>
      <p class="causal-formula">DiD = (treated post − treated pre) − (comparison post − comparison pre)</p>
      <small>Scenario rates are invented to explain the design. No PlayStation or Lifepal causal effect was estimated; this is separate from the six-title dbt reference.</small>
    </article>`);
  const stats = data.statistics?.overall;
  if (stats) {
    const diagnosticPanels = {
      quality: `<b>STATISTICAL LENS · TITLE GRAIN</b><span>${stats.first_pass_approved_titles}/${stats.titles_submitted} = ${formatPercent(stats.first_pass_approval_pct)}. Wilson score calculation: ${stats.wilson_lower_pct}–${stats.wilson_upper_pct}% under independent Bernoulli sampling. These six fixed fictional titles are not a random sample, so this is algebra, not an inferential interval or a partner ranking.</span><a href="https://github.com/rfim/nexus-playstation-partners/blob/main/macros/wilson_score_bound.sql" target="_blank" rel="noopener noreferrer">Inspect interval macro ↗</a>`,
      publication: `<b>STATISTICAL LENS · OBSERVABILITY</b><span>${stats.titles_published}/${stats.titles_submitted} titles have a publication event; ${stats.titles_without_publication} do not. Unobserved is not zero. A survival analysis would need a declared observation cutoff and follow-up window before estimating time to publication.</span><span><strong>Causal check:</strong> approval and publication can share upstream causes. Their time gap alone does not measure an approval effect.</span>`,
      speed: `<b>STATISTICAL LENS · ATTEMPT GRAIN</b><span>${stats.reviewed_attempts} completed attempts: mean ${stats.mean_review_hours}h, median ${stats.median_review_hours}h, IQR ${stats.q1_review_hours}–${stats.q3_review_hours}h, p90 ${stats.p90_review_hours}h. A single long review can move the mean; attempts also cluster within titles and partners.</span><span><strong>Causal check:</strong> compare eligible workflows at a fixed submission-time baseline; do not adjust for a later review outcome.</span>`,
      handoff: `<b>STATISTICAL LENS · SELECTED OUTCOMES</b><span>Lead time is observed for ${stats.observed_publication_leads}/${stats.titles_submitted} titles: mean ${stats.mean_lead_days}d, median ${stats.median_lead_days}d. The published-only mean describes those observed titles, not all submissions.</span><span><strong>Causal check:</strong> conditioning on publication can select a non-comparable group. Record a censoring cutoff and compare like-for-like cohorts before attributing any shift.</span>`
    };
    Object.entries(diagnosticPanels).forEach(([key, markup]) => {
      document.querySelector(`[data-chart="${key}"]`).insertAdjacentHTML('beforeend', `<div class="stat-lens">${markup}</div>`);
    });
  }
  $('#partner-charts').querySelectorAll('.chart-card').forEach((card) => { card.dataset.chartOrder = String(chartOrder.indexOf(card.dataset.chart)); });
  setupCausalExample(d3lib, data.causal_demo);
  const chartSources = {
    quality: ['Inspect first-pass SQL ↗', 'models/marts/mart_partner_publishing.sql']
  };
  Object.entries(chartSources).forEach(([key, [label, path]]) => {
    const card = document.querySelector(`[data-chart="${key}"]`);
    const link = document.createElement('a');
    link.className = 'chart-source-link';
    link.href = `https://github.com/rfim/nexus-playstation-partners/blob/main/${path}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    card.append(link);
  });
  const publicationCard = $('.publication-card');
  const publicationSvg = $('#publication-svg');
  const publicationPartnerNames = new Map(partners.map((partner) => [partner.partner_id, partner.partner_name]));
  let selectedPublication = Math.max(0, publicationEvents.findIndex((event) => event.prior_partner_published_titles > 0));
  const publicationSelectors = $('#publication-selectors');
  publicationEvents.forEach((event, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.publicationIndex = String(index);
    button.textContent = `${event.title_id} · ${publicationPartnerNames.get(event.partner_id) || event.partner_id}`;
    button.addEventListener('click', () => selectPublication(index));
    publicationSelectors.append(button);
  });
  function selectPublication(index) {
    const event = publicationEvents[index];
    if (!event) return;
    selectedPublication = index;
    publicationSelectors.querySelectorAll('button').forEach((button) => {
      const selected = Number(button.dataset.publicationIndex) === index;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    publicationSvg.querySelectorAll('.publication-row').forEach((row) => row.classList.toggle('is-selected', Number(row.dataset.index) === index));
    $('#publication-selected-name').textContent = `${event.title_id} · ${publicationPartnerNames.get(event.partner_id) || event.partner_id}`;
    $('#publication-selected-status').textContent = event.first_published_at ? 'Published' : 'Not observed';
    $('#publication-selected-status').dataset.status = event.first_published_at ? 'published' : 'unknown';
    $('#publication-selected-meta').textContent = `Approved ${event.approved_at.slice(0, 10)} · synthetic title`;
    $('#publication-prior-count').textContent = event.prior_partner_published_titles;
    $('#publication-prior-mean').textContent = event.prior_partner_avg_handoff_hours == null ? 'No history' : `${event.prior_partner_avg_handoff_hours}h`;
    $('#publication-attempt').textContent = `#${event.approval_attempt_number}`;
    $('#publication-observed').textContent = event.first_published_at ? `${event.observed_handoff_hours}h to first publication` : 'No event observed';
  }
  function drawPublicationGraph(animate = false) {
    if (!d3lib || !publicationEvents.length) {
      publicationSvg.innerHTML = '<text x="20" y="50">Inspect the title buttons for publication history.</text>';
      return;
    }
    const svg = d3lib.select(publicationSvg);
    svg.selectAll('*').remove();
    const maxHours = Math.max(96, Math.ceil(d3lib.max(publicationEvents, (event) => Number(event.observed_handoff_hours || 0)) / 24) * 24);
    const x = d3lib.scaleLinear().domain([0, maxHours]).range([174, 490]);
    const y = (index) => 62 + index * 35;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    svg.append('text').attr('class', 'publication-axis-title').attr('x', 174).attr('y', 20).text('HOURS SINCE APPROVAL');
    const ticks = d3lib.range(0, maxHours + 1, 24);
    svg.selectAll('.publication-tick').data(ticks).join('g').attr('class', 'publication-tick').each(function (tick) {
      const group = d3lib.select(this);
      group.append('line').attr('x1', x(tick)).attr('x2', x(tick)).attr('y1', 40).attr('y2', 272);
      group.append('text').attr('x', x(tick)).attr('y', 288).attr('text-anchor', 'middle').text(`${tick}h`);
    });
    const rows = svg.selectAll('.publication-row').data(publicationEvents).join('g')
      .attr('class', (event, index) => `publication-row${index === selectedPublication ? ' is-selected' : ''}`)
      .attr('data-index', (event, index) => index)
      .attr('transform', (event, index) => `translate(0,${y(index)})`);
    rows.append('text').attr('class', 'publication-title-label').attr('x', 16).attr('y', 4).text((event) => event.title_id);
    rows.append('circle').attr('class', 'publication-start').attr('cx', x(0)).attr('r', 4);
    const observed = rows.filter((event) => event.observed_handoff_hours != null);
    const lines = observed.append('line').attr('class', 'publication-span').attr('x1', x(0)).attr('x2', animate && !reducedMotion ? x(0) : (event) => x(event.observed_handoff_hours));
    const dots = observed.append('circle').attr('class', 'publication-end').attr('cx', animate && !reducedMotion ? x(0) : (event) => x(event.observed_handoff_hours)).attr('r', 6);
    observed.append('text').attr('class', 'publication-status').attr('x', 520).attr('y', 4).text((event) => `${event.observed_handoff_hours}h`);
    rows.filter((event) => event.observed_handoff_hours == null).append('text').attr('class', 'publication-status publication-unknown').attr('x', 520).attr('y', 4).text('Not observed');
    if (animate && !reducedMotion) {
      lines.transition().delay((event, index) => index * 100).duration(850).ease(d3lib.easeCubicOut).attr('x2', (event) => x(event.observed_handoff_hours));
      dots.transition().delay((event, index) => index * 100).duration(850).ease(d3lib.easeCubicOut).attr('cx', (event) => x(event.observed_handoff_hours));
    }
  }
  replayPublicationChart = () => drawPublicationGraph(true);
  drawPublicationGraph(false);
  selectPublication(selectedPublication);
  const leadSvg = $('#lead-svg');
  const leadSelectors = $('#lead-selectors');
  let selectedLead = Math.max(0, publicationEvents.findIndex((event) => event.prior_partner_published_at_submission > 0));
  publicationEvents.forEach((event, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.leadIndex = String(index);
    button.textContent = `${event.title_id} · ${event.title_name}`;
    button.addEventListener('click', () => selectLead(index));
    leadSelectors.append(button);
  });
  function selectLead(index) {
    const event = publicationEvents[index];
    if (!event) return;
    selectedLead = index;
    leadSelectors.querySelectorAll('button').forEach((button) => {
      const selected = Number(button.dataset.leadIndex) === index;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    leadSvg.querySelectorAll('.lead-event').forEach((point) => point.classList.toggle('is-selected', point.dataset.titleId === event.title_id));
    $('#lead-selected-name').textContent = event.title_name;
    $('#lead-selected-status').textContent = event.first_published_at ? 'Published' : 'Not observed';
    $('#lead-selected-status').dataset.status = event.first_published_at ? 'published' : 'unknown';
    $('#lead-selected-meta').textContent = `${event.title_id} · ${publicationPartnerNames.get(event.partner_id) || event.partner_id} · submitted ${event.first_submitted_at.slice(0, 10)}`;
    $('#lead-prior-count').textContent = event.prior_partner_published_at_submission;
    $('#lead-prior-mean').textContent = event.prior_partner_avg_lead_days_at_submission == null ? 'No history' : `${event.prior_partner_avg_lead_days_at_submission}d`;
    $('#lead-planned-date').textContent = event.planned_release_at;
    $('#lead-observed').textContent = event.first_published_at ? `${event.publication_lead_days}d to first publication` : 'No event observed';
  }
  function drawLeadGraph(animate = false) {
    if (!d3lib || !publicationEvents.length) {
      leadSvg.innerHTML = '<text x="20" y="50">Inspect the title buttons for publication lead time.</text>';
      return;
    }
    const svg = d3lib.select(leadSvg);
    svg.selectAll('*').remove();
    const maxDays = Math.max(7, Math.ceil(d3lib.max(publicationEvents, (event) => Number(event.publication_lead_days || 0))));
    const x = d3lib.scaleLinear().domain([0, maxDays]).range([185, 510]);
    const y = (index) => 73 + index * 71;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    svg.append('text').attr('class', 'lead-axis-title').attr('x', 185).attr('y', 22).text('DAYS FROM FIRST SUBMISSION');
    svg.selectAll('.lead-tick').data(d3lib.range(0, maxDays + 1)).join('g').attr('class', 'lead-tick').each(function (tick) {
      const group = d3lib.select(this);
      group.append('line').attr('x1', x(tick)).attr('x2', x(tick)).attr('y1', 42).attr('y2', 249);
      group.append('text').attr('x', x(tick)).attr('y', 278).attr('text-anchor', 'middle').text(`${tick}d`);
    });
    const rows = svg.selectAll('.lead-row').data(partners).join('g')
      .attr('class', 'lead-row').attr('transform', (partner, index) => `translate(0,${y(index)})`);
    rows.each(function (partner) {
      const group = d3lib.select(this);
      const titles = publicationEvents.filter((event) => event.partner_id === partner.partner_id);
      const published = titles.filter((event) => event.publication_lead_days != null);
      const days = published.map((event) => Number(event.publication_lead_days));
      const mean = Number(partner.avg_publication_lead_days);
      group.append('text').attr('class', 'lead-partner-name').attr('x', 16).attr('y', -13).text(partner.partner_name);
      group.append('text').attr('class', 'lead-partner-count').attr('x', 16).attr('y', 9).text(`${published.length}/${titles.length} observed`);
      group.append('line').attr('class', 'lead-track').attr('x1', x(0)).attr('x2', x(maxDays)).attr('y1', 0).attr('y2', 0);
      if (published.length > 1) group.append('line').attr('class', 'lead-range').attr('x1', x(d3lib.min(days))).attr('x2', animate && !reducedMotion ? x(d3lib.min(days)) : x(d3lib.max(days))).attr('y1', 0).attr('y2', 0)
        .call((line) => { if (animate && !reducedMotion) line.transition().duration(900).ease(d3lib.easeCubicOut).attr('x2', x(d3lib.max(days))); });
      const points = group.selectAll('.lead-event').data(published).join('g')
        .attr('class', (event) => `lead-event${event.title_id === publicationEvents[selectedLead]?.title_id ? ' is-selected' : ''}`)
        .attr('data-title-id', (event) => event.title_id);
      const circles = points.append('circle').attr('class', 'lead-title-dot').attr('cy', 0).attr('r', 7)
        .attr('cx', animate && !reducedMotion ? x(0) : (event) => x(event.publication_lead_days));
      if (animate && !reducedMotion) circles.transition().duration(950).ease(d3lib.easeCubicOut).attr('cx', (event) => x(event.publication_lead_days));
      const diamonds = group.append('path').attr('class', 'lead-mean-marker').attr('d', 'M0,-7 L7,0 L0,7 L-7,0 Z')
        .attr('transform', `translate(${animate && !reducedMotion ? x(0) : x(mean)},20)`);
      if (animate && !reducedMotion) diamonds.transition().delay(180).duration(950).ease(d3lib.easeCubicOut).attr('transform', `translate(${x(mean)},20)`);
      group.append('text').attr('class', 'lead-mean-label').attr('x', 535).attr('y', 5).text(`${mean}d mean`);
    });
  }
  replayLeadChart = () => drawLeadGraph(true);
  drawLeadGraph(false);
  selectLead(selectedLead);
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
  replayReviewChart = animateReviewGraph;
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
  const dashboard = $('#featured-dashboard');
  if ('IntersectionObserver' in window) {
    const dashboardObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        dashboard.classList.add('is-visible');
        if (dashboard.querySelector('.publication-card')) replayPublicationChart();
        if (dashboard.querySelector('.review-card')) replayReviewChart();
        dashboardObserver.disconnect();
      }
    }, {threshold: 0.1});
    dashboardObserver.observe(dashboard);
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        suite.classList.add('is-visible');
        if (suite.querySelector('.review-card')) replayReviewChart();
        if (suite.querySelector('.publication-card')) replayPublicationChart();
        if (suite.querySelector('.lead-card')) replayLeadChart();
        observer.disconnect();
      }
    }, {threshold: 0.12});
    observer.observe(suite);
  } else {
    dashboard.classList.add('is-visible');
    suite.classList.add('is-visible');
    replayReviewChart();
    replayPublicationChart();
    replayLeadChart();
  }
}

function setupCausalExample(d3lib, demo) {
  // Separate invented dbt seed and model. Never derived from the operational six-title mart.
  const treated = demo.weeks.map((week) => Number(week.treated_rate_pct));
  const comparison = demo.weeks.map((week) => Number(week.comparison_rate_pct));
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const treatedChange = mean(treated.slice(4)) - mean(treated.slice(0, 4));
  const comparisonChange = mean(comparison.slice(4)) - mean(comparison.slice(0, 4));
  const effect = Number(demo.did_pp);
  const placebo = Number(demo.pre_period_placebo_pp);
  $('#causal-estimate').textContent = `${effect > 0 ? '+' : ''}${effect} pp`;
  $('#causal-decomposition').textContent = `Treated +${treatedChange} pp − comparison +${comparisonChange} pp`;
  $('#causal-placebo').textContent = `The invented pre-period placebo is ${placebo} pp by construction.`;
  $('#causal-sensitivity').textContent = `Pre-period slope gap: ${demo.pretrend_slope_gap_pp_per_week} pp/week. If untreated trends diverged by 1 pp/week across the ${demo.pre_post_mean_week_gap}-week mean-period gap, the arithmetic falls to ${demo.effect_if_1pp_week_drift} pp. This is a sensitivity scenario, not an estimate.`;

  function draw(animate = false) {
    const target = $('#causal-svg');
    if (!d3lib) {
      target.innerHTML = '<text x="24" y="70">Illustrative comparison: treated 50% → 68%; comparison 48% → 54%; difference-in-differences +12 pp.</text>';
      return;
    }
    const svg = d3lib.select(target);
    svg.selectAll('*').remove();
    const x = d3lib.scaleLinear().domain([0, 7]).range([67, 560]);
    const y = d3lib.scaleLinear().domain([40, 80]).range([250, 42]);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animatePaths = animate && !reducedMotion;
    const line = d3lib.line().x((point) => x(point.week)).y((point) => y(point.rate)).curve(d3lib.curveMonotoneX);
    const series = (values, start = 0) => values.map((rate, index) => ({week: start + index, rate}));
    const preGap = mean(treated.slice(0, 4)) - mean(comparison.slice(0, 4));
    const counterfactual = [{week: 3, rate: treated[3]}, ...comparison.slice(4).map((rate, index) => ({week: index + 4, rate: rate + preGap}))];

    svg.append('rect').attr('class', 'causal-post-band').attr('x', x(3.5)).attr('y', 25).attr('width', 610 - x(3.5)).attr('height', 238);
    [40, 50, 60, 70, 80].forEach((tick) => {
      svg.append('line').attr('class', 'causal-gridline').attr('x1', 65).attr('x2', 610).attr('y1', y(tick)).attr('y2', y(tick));
      svg.append('text').attr('class', 'causal-axis-label').attr('x', 16).attr('y', y(tick) + 4).text(`${tick}%`);
    });
    svg.append('line').attr('class', 'causal-intervention').attr('x1', x(3.5)).attr('x2', x(3.5)).attr('y1', 25).attr('y2', 263);
    svg.append('text').attr('class', 'causal-period-label').attr('x', 70).attr('y', 21).text('PRE / BASELINE');
    svg.append('text').attr('class', 'causal-period-label').attr('x', x(3.5) + 12).attr('y', 21).text('POST / WORKFLOW CHANGE');
    d3lib.range(8).forEach((week) => svg.append('text').attr('class', 'causal-axis-label').attr('x', x(week)).attr('y', 284).attr('text-anchor', 'middle').text(`W${week + 1}`));

    [
      ['causal-line-control', series(comparison)],
      ['causal-line-counterfactual', counterfactual],
      ['causal-line-treated', series(treated)]
    ].forEach(([className, points]) => {
      const path = svg.append('path').attr('class', className).attr('d', line(points));
      if (animatePaths && className !== 'causal-line-counterfactual') {
        const length = path.node().getTotalLength();
        path.attr('stroke-dasharray', `${length} ${length}`).attr('stroke-dashoffset', length)
          .transition().duration(1350).ease(d3lib.easeCubicOut).attr('stroke-dashoffset', 0);
      }
    });
    svg.selectAll('.causal-point-control').data(series(comparison)).join('circle')
      .attr('class', 'causal-point-control').attr('cx', (point) => x(point.week)).attr('cy', (point) => y(point.rate))
      .attr('r', animatePaths ? 0 : 3.5)
      .call((selection) => { if (animatePaths) selection.transition().delay((point) => point.week * 120).duration(350).attr('r', 3.5); });
    svg.selectAll('.causal-point-treated').data(series(treated)).join('circle')
      .attr('class', 'causal-point-treated').attr('cx', (point) => x(point.week)).attr('cy', (point) => y(point.rate))
      .attr('r', animatePaths ? 0 : 4.5)
      .call((selection) => { if (animatePaths) selection.transition().delay((point) => point.week * 120).duration(350).attr('r', 4.5); });
    svg.append('line').attr('class', 'causal-effect-bracket').attr('x1', 592).attr('x2', 592).attr('y1', y(counterfactual.at(-1).rate)).attr('y2', y(treated.at(-1)));
    svg.append('text').attr('class', 'causal-effect-label').attr('x', 605).attr('y', (y(counterfactual.at(-1).rate) + y(treated.at(-1))) / 2 + 4).text(`+${effect} pp`);
  }

  replayCausalChart = () => draw(true);
  draw(false);
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

function setupGameSelection() {
  document.querySelectorAll('[data-game]').forEach((button) => {
    button.addEventListener('click', () => {
      activeGameKey = button.dataset.game;
      document.querySelectorAll('[data-game]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      renderGameStory();
    });
  });
  renderGameStory();
}

const RETURN_REASON_LABELS = {
  metadata_incomplete: 'incomplete metadata',
  suspend_resume_crash: 'a suspend/resume crash',
};

function setupPotentialCalculator(defaults) {
  const fields = ['titles', 'uplift', 'hours', 'days'];
  const input = (key) => $(`#bp-${key}`);
  if (fields.some((key) => !input(key))) return;
  const number = new Intl.NumberFormat('en-GB');
  if (defaults) {
    const preset = {
      titles: defaults.titles_per_year,
      uplift: defaults.first_pass_uplift_points,
      hours: defaults.reviewer_hours_per_attempt,
      days: defaults.days_added_per_resubmission,
    };
    fields.forEach((key) => { if (preset[key] != null) input(key).value = preset[key]; });
  }
  const value = (key) => Number(input(key).value);
  const render = () => {
    fields.forEach((key) => { $(`#bp-${key}-out`).textContent = number.format(value(key)); });
    const attempts = Math.round(value('titles') * value('uplift') / 100);
    $('#bp-attempts').textContent = number.format(attempts);
    $('#bp-saved').textContent = `${number.format(attempts * value('hours'))} h`;
    $('#bp-days-total').textContent = number.format(attempts * value('days'));
  };
  fields.forEach((key) => input(key).addEventListener('input', render));
  render();
}

async function setupPotential() {
  if (!$('#potential')) return;
  let potential = null;
  try {
    potential = (await loadJSON('assets/metrics.json')).business_potential;
  } catch (error) {
    setupPotentialCalculator(null);
    return;
  }
  if (!potential) { setupPotentialCalculator(null); return; }
  const {summary, resubmission, health, as_of_date: asOf} = potential;
  const [, month, day] = asOf.split('-').map(Number);
  const clock = `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]}`;
  $('#bp-shelf-stat').textContent = `${summary.titles_awaiting_shelf} of ${summary.titles}`;
  $('#bp-shelf-note').textContent = `synthetic titles approved but not on any storefront at ${clock}`;
  const top = resubmission[0];
  $('#bp-resub-stat').textContent = `${summary.rejected_attempts} returns`;
  $('#bp-resub-note').textContent = `${summary.rejected_reviewer_hours} reviewer hours; ${RETURN_REASON_LABELS[top.return_reason] || top.return_reason.replaceAll('_', ' ')} caused ${top.rejected_attempts} of ${summary.rejected_attempts}`;
  const weakest = health[0];
  const pct = (value) => Math.round(100 * value);
  $('#bp-health-stat').textContent = `${pct(weakest.first_pass_wilson_lower)}–${pct(weakest.first_pass_wilson_upper)}%`;
  const note = $('#bp-health-note');
  note.textContent = `${weakest.partner_name} first-pass, Wilson 95% on ${weakest.first_pass_approved_titles} of ${weakest.titles_submitted}; health ${weakest.health_score.toFixed(2)}, lowest of ${health.length} `;
  if (weakest.is_low_sample) {
    const flag = document.createElement('span');
    flag.className = 'bp-flag';
    flag.textContent = 'LOW SAMPLE';
    note.append(flag);
  }
  setupPotentialCalculator(potential.calculator_defaults);
}

setupChartSlides();
setupGameSelection();
setupRoute();
setupFanoutExplorer();
setupMetrics().catch(() => {
  $('#partner-list').textContent = 'Model output could not load. Open the repository for the synthetic data.';
});
setupCodeInspector().catch(() => {
  $('#proof-code').textContent = 'Code preview could not load. Open the repository to inspect the source.';
});
setupPotential();
