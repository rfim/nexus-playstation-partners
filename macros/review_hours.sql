{% macro review_hours(start_time, end_time) %}
    date_diff('hour', {{ start_time }}, {{ end_time }})
{% endmacro %}
