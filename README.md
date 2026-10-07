# NEXUS for PlayStation Partners

An independent Senior Analytics Engineer portfolio by Firman Insan Muhammad (VIM). The page leads with the NEXUS data path and its inspectable dbt source, then uses PlayStation game worlds as editorial examples of partner publishing questions. It demonstrates how the production NEXUS patterns I built at Lifepal can support clear, tested measures.

The hero labels this independent application **“Presented to PlayStation”** and shows the Sony Computer Entertainment heritage image supplied by VIM. Its full-page moving backdrop uses original broken circles, graphic cuts and green light inspired by Persona 6's visual mood. Blue flowing light and vector controller symbols in the architecture preview and accordion are original CSS/SVG animation inspired by the PS5 visual mood. These are not official console footage or UI.

**Live site:** https://rfim.github.io/nexus-playstation-partners/

## What is real, and what is an example

- **Production experience:** The dbt-first NEXUS architecture and outcomes described in the Lifepal section come from my Sony CV and prior work. My Deloitte experience includes Snowflake and dbt warehouses on AWS; AWS S3, Lambda and ECS are listed separately in my CV. The site keeps those contexts separate. This repository does not contain Lifepal or Deloitte data or production code.
- **Runnable portfolio reference:** The dbt project here uses six fictional titles, three fictional partners and synthetic submission/publication events. It does not use PlayStation or Capcom data. The dashboard values are exported from the built `mart_partner_publishing` model.
- **Interactive architecture and math:** The architecture signal picker reads the exported mart and replays the path through five source-linked stages. The Lifepal production evidence appears inside the architecture accordion. The math covers a title-grain proportion, Wilson score calculation, quantile review diagnostics, join weighting, a snapshot as-of condition, and a separate difference-in-differences teaching example. A displayed score interval is only formula arithmetic: the six fixed fictional titles are not an independent random sample.
- **Game art and charts:** Game examples sit directly after the architecture. The full architecture section rotates editorial art from [Final Fantasy VII Revelation](https://www.playstation.com/en-us/games/final-fantasy-vii-revelation/), [Monster Hunter Wilds: Ascendance](https://blog.playstation.com/2026/09/03/monster-hunter-wilds-ascendance-reveals-new-monsters-story-details-and-gameplay), [Resident Evil Veronica](https://www.playstation.com/en-us/games/resident-evil-veronica/) and an official [Grand Theft Auto VI screenshot](https://www.rockstargames.com/VI/media/screenshots). The accordion header has a separate original PlayStation-style animation. The architecture icons are original artwork inspired by Persona 6's circular visual language. The Sony Computer Entertainment heritage image was supplied by VIM as a visual reference. All marks and media belong to their respective owners. This is not affiliated with or endorsed by Sony Interactive Entertainment, PlayStation, Capcom, Square Enix, ATLUS, SEGA or Rockstar Games.
- **Story to measure:** Selecting a game changes its editorial question and places the matching synthetic dashboard beside the example on wide screens and below it on smaller screens. Four supporting slides appear one at a time with direct chart selection and previous/next controls. The story follows a question → measure → possible decision narrative. These are prompts for partner conversations, never claims about the named games or PlayStation's systems. The four operational charts read `assets/metrics.json`, including descriptive statistics from `mart_partner_statistical_diagnostics`. Chart 02 uses a separate 16-row invented weekly seed, `mart_workflow_did_demo`, and a D3 plot to explain a conditional counterfactual, pre-period placebo, pretrend slope, and a 1 pp/week drift sensitivity scenario. The fixture has no cohort sizes or unit-level outcomes, so it supports no standard error, interval or measured causal effect.
- **Point-in-time features:** The review-time D3 curve exposes prior completed review count, prior mean review time and current attempt number from `int_partner_review_features.sql`; current review duration is a later observed label. The publication D3 timeline follows each approved title to its first observed storefront event. The lead-time D3 plot shows title outcomes behind each partner mean from first submission to publication. The `int_title_publication_features.sql` model exposes only earlier partner history at each clock: before the selected title’s first submission or approval. Current publication and elapsed time are later outcomes. An unobserved publication is shown as unknown, not zero. These are candidate feature views; no predictive model was trained. D3 7.9.0 is vendored locally with its license in `assets/vendor/D3-LICENSE.txt`.
- **Stack logos:** AWS architecture icons come from the [official AWS architecture icon package](https://aws.amazon.com/architecture/icons/). The Snowflake logo comes from [Snowflake press resources](https://www.snowflake.com/en/news/). They indicate experience from the CV, not the runtime of this local dbt reference.

## Run the analytics reference

Use Python 3.12:

```bash
python -m pip install -r requirements.txt
dbt build --profiles-dir .
python scripts/export_metrics.py --check
python scripts/build_snippets.py --check
```

The DuckDB file is created in `target/`. No cloud account is needed. The build runs seeds, staging models, intermediate logic, a timestamp snapshot, a guarded as-of join, dimensions, a submission fact, a partner publishing mart, descriptive diagnostics, a separate causal arithmetic model, generic and singular tests, and an exposure. `semantic/partner_metrics.yml` is a versioned metric definition for discussion, not a deployed semantic layer.

To view the site locally:

```bash
python -m http.server 8767
```

Open http://localhost:8767/. Every architecture block opens source from this repository. GitHub Actions runs the dbt build and checks that the exported site data and snippets match the working files.

## Core metric contract

First-pass approval is `approved titles on attempt one / submitted titles`. Review time uses only attempts with a completed review. Review features include only reviews completed before each submission timestamp. Publication features include only storefront events before the selected title was approved. The selected title's later review duration or publication is an outcome, not a feature. Submission and publication streams aggregate separately at title grain before joining, and a singular test rejects title fanout. These definitions are deliberately small enough to inspect in the code.

`mart_partner_statistical_diagnostics.sql` adds means, quartiles, a 90th percentile, observed-publication counts, snapshot coverage, and a Wilson-score calculation. Its interval algebra is intentionally labeled as a teaching example. `int_partner_tier_asof_submission.sql` only uses snapshot versions valid at submission time; all nine synthetic submissions predate the first captured tier version, so the tier remains unknown. `mart_workflow_did_demo.sql` uses only `hypothetical_workflow_weeks.csv`, never the six operational titles. The +12 percentage-point contrast would require a real rollout design, plausible parallel trends, no material spillovers, unit-level denominators, and cluster-aware inference before being interpreted causally. See the [dbt macro guidance](https://docs.getdbt.com/docs/build/jinja-macros), [dbt tests](https://docs.getdbt.com/docs/build/data-tests), and [difference-in-differences review](https://doi.org/10.1016/j.jeconom.2023.03.008).
