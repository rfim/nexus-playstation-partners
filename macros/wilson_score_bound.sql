{# Algebraic Wilson score bound. Valid as an interval only under a defensible sampling design. #}
{% macro wilson_score_bound(proportion, trials, side, z=1.96) -%}
    {% if side not in ['lower', 'upper'] %}
        {{ exceptions.raise_compiler_error("wilson_score_bound side must be 'lower' or 'upper'") }}
    {% endif %}
    (
        case when ({{ trials }}) > 0 then
            (
                ({{ proportion }}) + ({{ z }} * {{ z }}) / (2.0 * ({{ trials }}))
                {{ '-' if side == 'lower' else '+' }}
                {{ z }} * sqrt(
                    ({{ proportion }}) * (1.0 - ({{ proportion }})) / ({{ trials }})
                    + ({{ z }} * {{ z }}) / (4.0 * ({{ trials }}) * ({{ trials }}))
                )
            ) / (1.0 + ({{ z }} * {{ z }}) / ({{ trials }}))
        end
    )
{%- endmacro %}
