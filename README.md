# NEXUS for PlayStation Partners

An independent Senior Analytics Engineer portfolio by Firman Insan Muhammad (VIM). The page leads with the NEXUS data path and its inspectable dbt source, then uses PlayStation game worlds as editorial examples of partner publishing questions. It demonstrates how the production NEXUS patterns I built at Lifepal can support clear, tested measures.

The hero labels this independent application **“Presented to PlayStation”** and shows the Sony Computer Entertainment heritage image supplied by VIM. The blue flowing light and floating controller symbols in the hero and architecture accordion are original CSS animation inspired by the PS5 visual mood, not official console footage or UI.

**Live site:** https://rfim.github.io/nexus-playstation-partners/

## What is real, and what is an example

- **Production experience:** The dbt-first NEXUS architecture and outcomes described in the Lifepal section come from my Sony CV and prior work. My Deloitte experience includes Snowflake and dbt warehouses on AWS; AWS S3, Lambda and ECS are listed separately in my CV. The site keeps those contexts separate. This repository does not contain Lifepal or Deloitte data or production code.
- **Runnable portfolio reference:** The dbt project here uses six fictional titles, three fictional partners and synthetic submission/publication events. It does not use PlayStation or Capcom data. The dashboard values are exported from the built `mart_partner_publishing` model.
- **Interactive architecture and math:** The architecture signal picker reads the exported mart and replays the path through five source-linked stages. The Lifepal production evidence appears inside the architecture accordion. The first-pass approval sliders start at the built result and clearly switch to a hypothetical scenario when moved. The join fanout comparison illustrates why the real dbt model aggregates streams before joining.
- **Game media:** The game examples sit directly after the architecture. The accordion cycles art from the official [Monster Hunter Wilds: Ascendance PlayStation Blog post](https://blog.playstation.com/2026/09/03/monster-hunter-wilds-ascendance-reveals-new-monsters-story-details-and-gameplay), [Final Fantasy VII Revelation](https://www.playstation.com/en-us/games/final-fantasy-vii-revelation/), [Persona 6](https://store.playstation.com/en-us/concept/10009619/) and [Resident Evil Veronica](https://www.playstation.com/en-us/games/resident-evil-veronica/) pages. Its on-click videos embed official trailers from [PlayStation (Ascendance)](https://www.youtube.com/watch?v=SodbU0PEVH4), [PlayStation (Final Fantasy)](https://www.youtube.com/watch?v=8JszLth0_Gc), [ATLUS West](https://www.youtube.com/watch?v=CL-q0HgfMOY) and [PlayStation (Resident Evil)](https://www.youtube.com/watch?v=S4msqGQxSAg). The architecture icons are original artwork inspired by Persona 6's circular visual language. The Sony Computer Entertainment heritage image was supplied by VIM as a visual reference. All marks and media belong to their respective owners. This is not affiliated with or endorsed by Sony Interactive Entertainment, PlayStation, Capcom, Square Enix, ATLUS or SEGA.
- **Stack logos:** AWS architecture icons come from the [official AWS architecture icon package](https://aws.amazon.com/architecture/icons/). The Snowflake logo comes from [Snowflake press resources](https://www.snowflake.com/en/news/). They indicate experience from the CV, not the runtime of this local dbt reference.

## Run the analytics reference

Use Python 3.12:

```bash
python -m pip install -r requirements.txt
dbt build --profiles-dir .
python scripts/export_metrics.py --check
python scripts/build_snippets.py --check
```

The DuckDB file is created in `target/`. No cloud account is needed. The build runs seeds, staging models, intermediate logic, a snapshot, dimensions, a submission fact, a partner publishing mart, generic and singular tests, and an exposure. `semantic/partner_metrics.yml` is a versioned metric definition for discussion, not a deployed semantic layer.

To view the site locally:

```bash
python -m http.server 8767
```

Open http://localhost:8767/. Every architecture block opens source from this repository. GitHub Actions runs the dbt build and checks that the exported site data and snippets match the working files.

## Core metric contract

First-pass approval is `approved titles on attempt one / submitted titles`. Review time uses only attempts with a completed review. Submission and publication streams aggregate separately at title grain before joining, and a singular test rejects title fanout. These definitions are deliberately small enough to inspect in the code.
