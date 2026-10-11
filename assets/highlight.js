// Small syntax highlighter for the workspace: SQL (with dbt Jinja), Python and YAML.
// highlightLines(code, lang) returns one HTML string per line, so callers can add
// line numbers; tokens that span lines are closed and reopened at each break.
(() => {
  const SQL_KW = 'select|from|where|and|or|not|in|is|null|as|on|join|left|right|inner|outer|full|cross|using|group|by|order|having|limit|offset|union|all|distinct|case|when|then|else|end|with|recursive|over|partition|rows|range|between|preceding|following|current|row|asc|desc|create|view|table|insert|into|values|update|set|delete|cast|filter|exists|like|ilike|true|false|interval|date|timestamp|qualify|lateral|unnest|except|intersect|describe|copy|to|format|nulls|first|last';
  const SQL_FN = 'count|sum|avg|min|max|round|coalesce|nullif|date_trunc|date_diff|extract|last_day|upper|lower|trim|row_number|rank|dense_rank|lag|lead|first_value|last_value|abs|sqrt|power|greatest|least|concat|length|len|strftime|read_parquet|read_json|version|any_value|string_agg|list|struct_pack';
  const PY_KW = 'False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield';
  const PY_BUILTIN = 'print|len|range|dict|list|set|tuple|str|int|float|bool|sorted|sum|min|max|open|isinstance|enumerate|zip|map|filter|any|all|super|type|getattr|setattr|Path|json|os';

  const RULES = {
    sql: [
      ['com', /--[^\n]*|\/\*[\s\S]*?\*\//y],
      ['jinja', /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/y],
      ['str', /'(?:[^'\\]|\\.|'')*'/y],
      ['ident', /"(?:[^"]|"")*"/y],
      ['num', /\b\d+(?:\.\d+)?\b/y],
      ['kw', new RegExp(`\\b(?:${SQL_KW})\\b`, 'iy')],
      ['fn', new RegExp(`\\b(?:${SQL_FN})(?=\\s*\\()`, 'iy')],
      ['type', /\b(?:varchar|bigint|integer|int|double|boolean|hugeint|decimal|text)\b/iy],
      ['op', /::|[<>!=]=?|[+\-*/%|]/y],
    ],
    python: [
      ['com', /#[^\n]*/y],
      ['str', /(?:[rbfu]{0,2})(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/iy],
      ['deco', /@[\w.]+/y],
      ['num', /\b\d+(?:\.\d+)?\b/y],
      ['kw', new RegExp(`\\b(?:${PY_KW})\\b`, 'y')],
      ['def', /(?<=\b(?:def|class)\s+)\w+/y],
      ['builtin', new RegExp(`\\b(?:${PY_BUILTIN})\\b`, 'y')],
      ['fn', /\b\w+(?=\()/y],
      ['op', /[<>!=]=?|>>|<<|[+\-*/%&|^~]/y],
    ],
    yaml: [
      ['com', /#[^\n]*/y],
      ['jinja', /\{\{[\s\S]*?\}\}/y],
      ['key', /(?<=^[ \t-]*)[\w.+-]+(?=\s*:)/my],
      ['str', /"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'/y],
      ['num', /\b\d+(?:\.\d+)?\b/y],
      ['kw', /\b(?:true|false|null|yes|no)\b/y],
      ['op', /^[ \t]*-(?=\s)/my],
    ],
  };
  RULES.yml = RULES.yaml;

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function tokenize(code, lang) {
    const rules = RULES[lang];
    if (!rules) return [[null, code]];
    const out = [];
    let i = 0, plain = '';
    while (i < code.length) {
      let hit = null;
      for (const [cls, re] of rules) {
        re.lastIndex = i;
        const m = re.exec(code);
        if (m && m.index === i && m[0].length) { hit = [cls, m[0]]; break; }
      }
      if (hit) {
        if (plain) { out.push([null, plain]); plain = ''; }
        out.push(hit);
        i += hit[1].length;
      } else {
        plain += code[i];
        i += 1;
      }
    }
    if (plain) out.push([null, plain]);
    return out;
  }

  function highlightLines(code, lang) {
    const lines = [''];
    for (const [cls, text] of tokenize(code, lang)) {
      text.split('\n').forEach((part, k) => {
        if (k > 0) lines.push('');
        if (part) lines[lines.length - 1] += cls ? `<span class="hl-${cls}">${esc(part)}</span>` : esc(part);
      });
    }
    return lines;
  }

  window.NexusHighlight = { highlightLines, highlight: (code, lang) => highlightLines(code, lang).join('\n') };
})();
