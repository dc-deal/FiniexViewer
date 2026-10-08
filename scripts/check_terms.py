"""Do the words on our screen still match the fields and the words behind them?

Run it from the project root. It prints NOTHING when everything agrees:

    python scripts/check_terms.py              # the check
    python scripts/check_terms.py --baseline   # rewrite the register from the current state

It exists because a label is the one thing in this app that nothing else verifies. The type-checker
proves a field exists; the suite proves a figure is drawn; neither has an opinion about the WORD
beside it. Measured 2026-10-07: FiniexTestingIDE renamed `run-summary.orders_sent` to
`orders_submitted` and announced the contract as additive, our mirror kept the old name, and the
panel rendered `Executed 1/undefined` for days until a person saw it. This check is one line of
output instead of that.

**The register holds the MAPPING and never the MEANING.** `term_register.json` says which field a
label renders — our label is our display word and nobody else owns it — and points at the document
that explains the field. What the field MEANS is fetched from the backend when it is wanted, never
stored here: a copy of someone else's glossary is stale the day they reword a definition, with
nothing saying so. The one exception is `ours`, a sentence about a word WE invented, which is our
own content about our own label.

A document NAME is recorded and a line number is not, deliberately: a renamed document fails loudly
and a shifted line fails silently.

**A `note` is a judgement and the tool never writes one.** JSON carries no comments, so the five
words it may begin with are listed here instead, and a regeneration preserves whatever is there:

    display-term   ours by choice — the backend names no word for it, and ours claims nothing false
    adopted        ours now matches theirs; the note says what it was before, so nobody turns it back
    change         ours should move to theirs, with the reason beside it
    undocumented   served, and their consumer layer does not describe it — a question for them
    unresolved     the mechanical join is wrong or impossible here, and it OVERRULES that join

**It finds CHANGE, not wrongness.** That a column head reads badly is a judgement, made once and
kept in `note`; a comparison can never find it, because nothing moves. What a comparison does find
is the four things that move underneath a label:

  1. a label we render that the register does not know            (a new panel, unjudged)
  2. a label whose FIELD changed                                  (we re-pointed it)
  3. a field that vanished from the backend's documentation       (they renamed or removed it)
  4. a console label of theirs that changed                       (their word moved)

Three sources, and the first is the authority: the backend's console renderers carry its own word on
a SCREEN, which is what a label has to agree with. Its consumer documentation says what a field
MEANS. Only literal strings and the expression beside them are read from the renderers — nothing
here infers behaviour from code in the sibling checkout.

The sibling tree is optional. Without it the console half is skipped and says so, because a check
that quietly tests less than it claims is worse than one that refuses.
"""
import json
import os
import re
import sys

REGISTER = os.path.join('scripts', 'term_register.json')
OURS = 'src'
THEIR_DOCS = os.path.join('ide_docs', 'consumer')
THEIR_CONSOLE = os.path.join('..', 'FiniexTestingIDE', 'python', 'framework', 'reporting', 'console')
# The one document that names a field it has REMOVED. It records history, so it cannot stand as
# evidence that a field is still served — see `their_docs` and the GONE test.
HISTORY_ONLY = 'contract-log'

LABEL = re.compile(r"label:\s*t\('([^']*)'\)")
RANK_ON_COLUMN = re.compile(r'\brank:\s*(\d+)')
CELL = re.compile(r':data-rank="(\d+)"')
INLINE_LABEL = re.compile(r"\{\{\s*t\('([^']*)'\)\s*\}\}")
MUSTACHE = re.compile(r'\{\{(.*?)\}\}')
READING = re.compile(r'(?:[A-Za-z_][A-Za-z0-9_]*(?:\([^()]*\))?!?\.)+([a-z][a-z0-9_]{2,})')
HOLDERS = (r'row|unit|summary|model|order|trade|period|entry|session|deployment|bar|scenario|'
           r'headline|aggregate|funnel|info|fold|item|broker|total|combination|run|block|card|'
           r'symbol|check|warning|detail|instance|window')
FIELD = re.compile(r'\b(?:' + HOLDERS + r')\.([a-z][a-z0-9_]*)')
SKIP = ('value', 'label', 'currency', 'length', 'key', 'rows', 'open', 'map', 'filter', 'find',
        'join')

CONSOLE_LABEL = re.compile(r'["\']\s*([A-Z][A-Za-z0-9 /&%().\'-]{1,30}?):\s*(?:\{|\s*["\'])')

def fields_in(text):
    found = []
    for candidate in FIELD.findall(text):
        if candidate not in found and candidate not in SKIP:
            found.append(candidate)
    return found


def inline_pairs(line):
    """(label, field) where a label in TEMPLATE text stands directly beside the value it names.

    `label: t('…')` is a declaration and names its field in the lines below it. A funnel heading
    says the same thing in another syntax — `{{ t('resolved') }} {{ f(x)!.total_resolved }}` — and
    was invisible here until contract 23 renamed all five of those fields and this check stayed
    silent through it.

    The adjacency IS the rule, and it is deliberately strict: only the readings between this label
    and the NEXT one belong to it. A label with no reading after it is prose or a section heading
    rather than a word naming a field — measured over `src/`, 124 of 143 inline labels are exactly
    that, and registering them would assert pairs nobody can defend.
    """
    found = []
    for match in INLINE_LABEL.finditer(line):
        tail = line[match.end():]
        following = INLINE_LABEL.search(tail)
        window = tail[:following.start()] if following else tail
        for expression in MUSTACHE.findall(window):
            names = [name for name in READING.findall(expression) if name not in SKIP]
            if names:
                found.append((match.group(1), names[0]))
                break
    return found


def read_lines(path):
    with open(path, encoding='utf-8') as handle:
        return handle.read().split('\n')


def our_pairs():
    """(label, field) for every display label that names a served field.

    Three shapes, and the second is why the `rank` is read: a ListColumn array holds the headings
    and the row template holds the cells, far apart but in the same order. Both sides declare the
    rank of each column, and a unit test already holds the two equal — so the positional zip
    verifies itself, and a disagreement is dropped rather than paired wrongly.

    The third is `inline_pairs` — a label written in template text rather than declared.
    """
    pairs = {}
    unresolved = []
    for folder, _, names in os.walk(OURS):
        for name in sorted(names):
            if not (name.endswith('.vue') or name.endswith('.ts')):
                continue
            path = os.path.join(folder, name).replace(os.sep, '/')
            lines = read_lines(path)
            columns, cells, inline = [], [], []
            for index, line in enumerate(lines):
                inline += inline_pairs(line)
                match = LABEL.search(line)
                if match:
                    found = fields_in(' '.join(lines[index:index + 4]))
                    rank = RANK_ON_COLUMN.search(' '.join(lines[index:index + 3]))
                    if found:
                        pairs.setdefault(match.group(1), found[0])
                    else:
                        columns.append((match.group(1), rank.group(1) if rank else '-'))
                if CELL.search(line):
                    cells.append((CELL.search(line).group(1),
                                  fields_in(' '.join(lines[index:index + 2]))))
            if columns and len(columns) == len(cells):
                for (label, rank), (cell_rank, found) in zip(columns, cells):
                    if rank == cell_rank and found:
                        pairs.setdefault(label, found[0])
                    else:
                        unresolved.append((path, label))
            else:
                unresolved += [(path, label) for label, _ in columns]
            # last, so both declaration shapes outrank it: a rank-verified column pair is a
            # stronger statement than two interpolations that happen to sit side by side
            for label, field in inline:
                pairs.setdefault(label, field)
    return pairs, unresolved


def their_docs():
    """field -> the document that DEFINES it. The NAME only: a line number rots in silence.

    A field is named in several documents and they are not equal. Their field tables read
    `| `field` | what it is |`, and that cell is the definition — so a table row wins over a
    mention in prose. `contract-log` is last whatever it carries: it records what CHANGED, which
    is the wrong answer to "what is this".
    """
    if not os.path.isdir(THEIR_DOCS):
        return None
    table_row = re.compile(r'^\s*\|\s*`([a-z][a-z0-9_]{2,})`[^|]*\|')
    defined, mentioned = {}, {}
    names = sorted(os.listdir(THEIR_DOCS), key=lambda n: (n.startswith('contract-log'), n))
    for name in names:
        if not name.endswith('.md'):
            continue
        history = name.startswith(HISTORY_ONLY)
        for line in read_lines(os.path.join(THEIR_DOCS, name)):
            row = table_row.match(line)
            # the changelog DEFINES nothing — it records what moved. Letting it define a field
            # would make a field it alone names indistinguishable from a field still served.
            if row and not history:
                defined.setdefault(row.group(1), name[:-3])
            for token in re.findall(r'`([a-z][a-z0-9_]{2,})`', line):
                mentioned.setdefault(token, name[:-3])
    return {**mentioned, **defined}


def their_console():
    """Every label the backend prints, as a set."""
    if not os.path.isdir(THEIR_CONSOLE):
        return None
    labels = set()
    for name in sorted(os.listdir(THEIR_CONSOLE)):
        if not name.endswith('.py'):
            continue
        for line in read_lines(os.path.join(THEIR_CONSOLE, name)):
            match = CONSOLE_LABEL.search(line)
            if match:
                labels.add(match.group(1).strip())
    return labels


def load_register():
    if not os.path.exists(REGISTER):
        return None
    with open(REGISTER, encoding='utf-8') as handle:
        return json.load(handle)


def entry_line(label, entry):
    """One entry per line, so a changed word is a one-line diff and the file is still JSON."""
    body = ', '.join(f'{json.dumps(key)}: {json.dumps(entry.get(key))}'
                     for key in ('field', 'doc', 'their', 'ours', 'note'))
    return f'  {json.dumps(label)}: {{{body}}}'


def baseline():
    """Rewrite the register, carrying every judgement over.

    It writes the FILE rather than stdout: a shell redirect on Windows encodes in the console's
    code page, and this file is UTF-8.
    """
    pairs, unresolved = our_pairs()
    docs = their_docs() or {}
    console = their_console() or set()
    kept = load_register() or {}

    entries = {}
    for label in sorted(pairs):
        field = pairs[label]
        before = kept.get(label, {})
        note = before.get('note') or ''
        # A recorded `unresolved` OVERRULES the mechanical join. The extraction pairs a heading to
        # a cell by position, and where somebody has read the component and found that wrong, the
        # register must keep saying so — otherwise the next regeneration quietly reinstates a
        # mapping a person already refuted, and a register that asserts a false pair is worse than
        # one that admits a gap.
        if note.startswith('unresolved'):
            entries[label] = {'field': None, 'doc': None, 'their': None,
                              'ours': before.get('ours'), 'note': note}
            continue
        entries[label] = {
            'field': field,
            'doc': docs.get(field),
            'their': label if label in console else None,
            'ours': before.get('ours'),
            'note': note,
        }
    # A judgement recorded against a label whose field could not be joined is still a judgement,
    # and dropping it on a regeneration would lose the one thing a comparison cannot re-derive.
    for path, label in sorted(set(unresolved)):
        # The same word appears in several panels, and one of them joining is enough: "Net P&L" is
        # a column of the trade list AND a helper-driven cell of the roster. Recording it as
        # unresolved because of the second would throw away the first.
        if label in entries:
            continue
        before = kept.get(label, {})
        carried = (before.get('note') or '').split('unresolved ')[0].strip()
        marker = f'unresolved {path}'
        entries[label] = {
            'field': None, 'doc': None, 'their': None, 'ours': before.get('ours'),
            'note': f'{carried}  {marker}'.strip(),
        }

    body = ',\n'.join(entry_line(label, entries[label]) for label in sorted(entries))
    with open(REGISTER, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write('{\n' + body + '\n}\n')
    print(f'{len(pairs)} joined | {len(set(unresolved))} unresolved -> {REGISTER}')


def check():
    register = load_register()
    if register is None:
        print(f'no register at {REGISTER} — run --baseline and record the judgements first')
        return 1

    pairs, _ = our_pairs()
    docs = their_docs()
    console = their_console()
    findings = []

    for label, field in sorted(pairs.items()):
        known = register.get(label)
        if known is None:
            findings.append(f'  NEW      "{label}" renders {field} and the register does not know it')
        elif known.get('field') and known['field'] != field:
            findings.append(f'  MOVED    "{label}" now renders {field}, '
                            f'the register says {known["field"]}')

    if docs is None:
        findings.append(f'  SKIPPED  {THEIR_DOCS} is absent — run sync_ide_docs.sh; '
                        'the documentation half was NOT checked')
    else:
        for label, known in sorted(register.items()):
            field = known.get('field')
            note = known.get('note') or ''
            # `undocumented` is a note somebody wrote after looking: the field is served and their
            # consumer layer does not describe it, which is a question for the backend rather than
            # a finding to repeat on every run. It stays visible in the register, not in the output.
            if not field or note.startswith(('unresolved', 'undocumented')):
                continue
            # The changelog is not evidence of existence, and this is the whole reason GONE could
            # never fire: contract 23 removed `orders_sent` and `total_resolved`, and the document
            # announcing their removal still NAMES them. A field only the log knows is gone.
            if docs.get(field) in (None, HISTORY_ONLY):
                findings.append(f'  GONE     {field} ("{label}") is in no consumer document any more')

    if console is None:
        findings.append(f'  SKIPPED  {THEIR_CONSOLE} is absent — the sibling checkout is not '
                        'beside this one; their own labels were NOT checked')
    else:
        for label, known in sorted(register.items()):
            their = known.get('their')
            if their and their not in console:
                findings.append(f'  LABEL    they no longer print "{their}" '
                                f'(our "{label}" was recorded as agreeing with it)')

    if not findings:
        return 0
    print(f'{len(findings)} findings — the register is at {REGISTER}')
    for finding in findings:
        print(finding)
    return 1


if __name__ == '__main__':
    if '--baseline' in sys.argv:
        baseline()
        sys.exit(0)
    sys.exit(check())
