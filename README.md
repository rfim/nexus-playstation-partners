# NEXUS for PlayStation Partners

An independent Senior Analytics Engineer portfolio by Firman Insan Muhammad (VIM). This site is tailored to the PlayStation Partners Platform role and demonstrates how the production NEXUS patterns I built at Lifepal can support clear, tested partner publishing measures.

**Live site:** https://rfim.github.io/nexus-playstation-partners/

## What is real, and what is an example

- **Production experience:** The NEXUS architecture and outcomes described in the Lifepal section come from my CV and prior work. This repository does not contain Lifepal data or production code.
- **Runnable portfolio reference:** The dbt project here uses six fictional titles, three fictional partners and synthetic submission/publication events. It does not use PlayStation or Capcom data. The dashboard values are exported from the built `mart_partner_publishing` model.
- **Game media:** Monster Hunter Wilds art and logo are sourced from the [official PlayStation game page](https://www.playstation.com/en-gb/games/monster-hunter-wilds/). The video is an on-click embed of the [official Monster Hunter launch trailer](https://www.youtube.com/watch?v=a_wNFT4j6qI). The Sony Computer Entertainment heritage image was supplied by VIM as a visual reference. All marks and media belong to their respective owners. This is not affiliated with or endorsed by Sony Interactive Entertainment, PlayStation or Capcom.

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
