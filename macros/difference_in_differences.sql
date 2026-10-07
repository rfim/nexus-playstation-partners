{% macro difference_in_differences(treated_pre, treated_post, comparison_pre, comparison_post) -%}
    (({{ treated_post }}) - ({{ treated_pre }}))
    - (({{ comparison_post }}) - ({{ comparison_pre }}))
{%- endmacro %}
