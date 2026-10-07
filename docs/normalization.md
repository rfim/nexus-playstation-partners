# The 3NF boundary in the synthetic publishing reference

The four seeded source tables separate four business entities. Each has one declared key. Attributes describe that key, not another non-key attribute in the same row.

| Relation | Primary key | Functional dependency in this fixture | Reference |
| --- | --- | --- | --- |
| Partner | `partner_id` | `partner_id → partner_name, region, partner_tier` | — |
| Title | `title_id` | `title_id → partner_id, title_name, platform, planned_release_at` | `partner_id → Partner` |
| Submission | `submission_id` | `submission_id → title_id, submitted_at, reviewed_at, status, build_version` | `title_id → Title` |
| Publication | `publication_id` | `publication_id → title_id, published_at, storefront_region` | `title_id → Title` |

For this fixture, a title has one partner and one platform. If a production title can have several platforms or release plans, that relationship needs its own keyed table; copying a list into `raw_titles` would break this design.

The practical 3NF rule is that non-key attributes depend on the key, the whole key, and no other non-key attribute. Partner region lives with Partner, not repeated on Title or Submission. Review status lives with a Submission, while a storefront region lives with a Publication. Changing a partner name therefore needs one source-row update, rather than a repair across every title and event.

The source contract in [`models/staging/sources.yml`](../models/staging/sources.yml) checks primary-key uniqueness and non-nullness, plus foreign-key relationships. Those tests protect the declared keys; they do not prove every real-world functional dependency. The partner-tier [`snapshot`](../snapshots/partner_tier_history.sql) handles change over time separately. Its as-of model leaves events before the first captured version unknown.

The analytics layer deliberately changes shape. [`int_title_outcomes`](../models/intermediate/int_title_outcomes.sql) aggregates review and publication streams separately before joining at title grain. [`fct_submission`](../models/marts/fct_submission.sql) keeps attempt grain; [`dim_partner`](../models/marts/dim_partner.sql) offers a readable dimension. The [`partner mart`](../models/marts/mart_partner_publishing.sql) then answers questions without forcing every dashboard to rejoin the normalized event tables. This is a modeled handoff from a 3NF-shaped source to a dimensional analytics product, not a claim that the final mart is in 3NF.
