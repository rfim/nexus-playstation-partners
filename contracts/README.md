# Stakeholder data contracts

Each stakeholder owns one YAML file listing what they rely on. `partners.yml` covers
the partner scorecard and `finance.yml` the warehouse chargeback. Nobody hand-writes
the tests: a compiler turns each rule into a dbt test or a Great Expectations (GX)
expectation, depending on which is cheaper to run. At the end of the day the results
from both engines are reconciled into one verdict per stakeholder.

All data is synthetic.

## Where each rule runs

`contract_plan.py` routes every rule, checking in this order:

| Rule | Engine | Why |
| --- | --- | --- |
| On a delivered file (partner feed, billing export) | Great Expectations | dbt can only test what is already loaded. GX checks the file as delivered, so a bad drop never loads. |
| Tolerance or distribution (`mostly`, mean, sum, row count) | Great Expectations | GX has these built in and reports the observed value. In dbt each would need a custom macro. |
| Set-based SQL on a model (unique, accepted values, ranges, expressions, cross-model totals) | dbt test | Runs in the warehouse inside `dbt build`, moves no rows, and a failure stops downstream models. |
| Same as a test the project already has | dbt (reused) | Linked to the existing test rather than run twice. |

GX on a model reads only the columns its expectations need.

## The daily run

```bash
dbt parse --profiles-dir .
python contracts/compile.py      # contracts -> tests/contracts/*.sql + contracts/gx/expectations/*.json
python contracts/validate.py --scope files   # GX on the delivered files; stops a bad drop before it loads
dbt build --profiles-dir .                   # models + every dbt test, generated contract tests included
python contracts/validate.py --scope models  # GX tolerance checks on the built models
python contracts/reconcile.py                # both engines + reconcile chains -> assets/contracts.json
```

The Airflow DAG runs the same steps. `validate_contract_files` runs before the
seed load. After the test gate, `contracts.validate_contract_models` and
`contracts.reconcile_contracts` give the daily sign-off, and publishing waits on it.

## Reconciliation

Rule results alone don't prove that the number a stakeholder sees is the number
that was delivered. Each contract therefore lists `reconcile` chains: the same
measure taken at every hop, from the delivered file (a GX observed value) through
the loaded table to the mart, which must agree within a tolerance. A contract is:

- **signed off** when every rule passes and every chain matches,
- **signed off with warnings** when only `severity: warn` rules fail,
- **held** when an error rule fails or a chain breaks. `reconcile.py` then exits
  non-zero, so CI fails and nothing publishes.

## Rule vocabulary

`unique`, `not_null`, `accepted_values` (`values`), `between` (`min`, `max`),
`regex` (`pattern`), `expression`, `reconciles` (`left`, `right`, `tolerance`),
`columns_match` and `unique_combination` (`columns`), `row_count`, `sum` and `mean`
(`min`, `max`). Any rule can take `mostly` (a share of rows that must pass) and
`severity: warn`.
