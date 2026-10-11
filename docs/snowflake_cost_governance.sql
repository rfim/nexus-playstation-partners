-- =============================================================================
-- Production translation of the platform cost models (illustrative, not run).
--
-- The DuckDB reference reads four invented seeds shaped like Snowflake's
-- ACCOUNT_USAGE views. On Snowflake the same dbt models would read the real
-- views below instead. Warehouses and resource monitors are account-level
-- objects, so they live in plain SQL rather than in dbt.
--
--   seed                         -> Snowflake source
--   platform_warehouse_budget    -> WAREHOUSE_BUDGET (mirrors CREDIT_QUOTA below)
--   platform_warehouse_metering  -> ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
--   platform_query_attribution   -> ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY
--   platform_dbt_model_runs      -> a dbt on-run-end hook logging run_results
-- =============================================================================

-- One warehouse per workload, each behind its own monitor, so a runaway job in
-- one workload cannot spend credits budgeted for another.
CREATE RESOURCE MONITOR IF NOT EXISTS MON_NEXUS_BI
  WITH CREDIT_QUOTA = 15
  FREQUENCY = MONTHLY
  START_TIMESTAMP = IMMEDIATELY
  TRIGGERS
    ON 75 PERCENT DO NOTIFY             -- mart_cost_budget_vs_actual: 'notify'
    ON 100 PERCENT DO SUSPEND           -- 'suspended': running queries finish
    ON 110 PERCENT DO SUSPEND_IMMEDIATE;

CREATE WAREHOUSE IF NOT EXISTS NEXUS_BI_WH
  WAREHOUSE_SIZE = XSMALL
  AUTO_SUSPEND = 300
  AUTO_RESUME = TRUE
  MIN_CLUSTER_COUNT = 1
  MAX_CLUSTER_COUNT = 2                 -- dashboards have bursty concurrency
  INITIALLY_SUSPENDED = TRUE
  RESOURCE_MONITOR = MON_NEXUS_BI;

-- Repeat for NEXUS_LOAD_WH (10), NEXUS_DBT_WH (15) and NEXUS_CI_WH (10).

-- Credit quotas have no ACCOUNT_USAGE view to read back from, so the budget is
-- mirrored in a reference table for the budget-against-actual model.
CREATE TABLE IF NOT EXISTS PLATFORM.COST.WAREHOUSE_BUDGET (
    WAREHOUSE_NAME   VARCHAR NOT NULL PRIMARY KEY,
    RESOURCE_MONITOR VARCHAR NOT NULL,
    CREDIT_QUOTA     NUMBER(10, 2) NOT NULL,
    FREQUENCY        VARCHAR NOT NULL,
    WORKLOAD         VARCHAR NOT NULL
);

-- Source for cost_warehouse_daily. Replicates with up to ~3 hours of latency.
CREATE OR REPLACE VIEW PLATFORM.COST.WAREHOUSE_METERING_DAILY AS
SELECT
    WAREHOUSE_NAME,
    DATE_TRUNC('day', START_TIME)    AS USAGE_DATE,
    SUM(CREDITS_USED_COMPUTE)        AS CREDITS_USED_COMPUTE,
    SUM(CREDITS_USED_CLOUD_SERVICES) AS CREDITS_USED_CLOUD_SERVICES
FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
WHERE WAREHOUSE_NAME LIKE 'NEXUS\_%' ESCAPE '\\'
GROUP BY WAREHOUSE_NAME, USAGE_DATE;

-- Source for mart_cost_by_user. Per-query compute attribution excludes idle
-- time and lags by up to ~24 hours. It is only meaningful when each workload
-- logs in as its own service user rather than sharing an admin role.
CREATE OR REPLACE VIEW PLATFORM.COST.QUERY_ATTRIBUTION_DAILY AS
SELECT
    WAREHOUSE_NAME,
    USER_NAME,
    DATE_TRUNC('day', START_TIME)   AS USAGE_DATE,
    COUNT(*)                        AS QUERY_COUNT,
    SUM(CREDITS_ATTRIBUTED_COMPUTE) AS CREDITS_ATTRIBUTED
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY
WHERE WAREHOUSE_NAME LIKE 'NEXUS\_%' ESCAPE '\\'
GROUP BY WAREHOUSE_NAME, USER_NAME, USAGE_DATE;

-- Lineage needs no extra table: dbt's manifest.json already records every
-- ref() and source(), and Snowflake's ACCOUNT_USAGE.ACCESS_HISTORY and
-- OBJECT_DEPENDENCIES trace what queries read at run time.
