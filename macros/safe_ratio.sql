{% macro safe_ratio(numerator, denominator) -%}
    ({{ numerator }}) * 1.0 / nullif(({{ denominator }}), 0)
{%- endmacro %}
