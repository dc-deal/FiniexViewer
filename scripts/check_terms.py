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

**The register is keyed on the label TEXT, not on label plus component — decided 2026-10-08 and
left as it is.** Where the same word appears in two components for two fields, one entry survives
and the walk order decides which; both carry a note saying so. Measured that day: 2 of 146 labels
collide (`Started` → `start_time` here and `started` there, and `Max DD`). A key of
`Label@Component` would settle them and turn a linguistic key into a technical one — every recorded
judgement would then hang on a file name and break on the next rename. Two documented collisions are
the cheaper side of that trade.

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
# the line that closes one entry of a figure array — see `declared_window`
ENTRY_END = re.compile(r'\s*\}[,)]?\s*$')
RANK_ON_COLUMN = re.compile(r'\brank:\s*(\d+)')
CELL = re.compile(r':data-rank="(\d+)"')
INLINE_LABEL = re.compile(r"\{\{\s*t\('([^']*)'\)\s*\}\}")
MUSTACHE = re.compile(r'\{\{(.*?)\}\}')
TEMPLATE_LABEL = re.compile(r"\$\{\s*t\('([^']*)'\)\s*\}")
TEMPLATE_EXPR = re.compile(r'\$\{(.*?)\}')
READING = re.compile(r'(?:[A-Za-z_][A-Za-z0-9_]*(?:\([^()]*\))?!?\.)+([a-z][a-z0-9_]{2,})')
HOLDERS = (r'row|unit|summary|model|order|trade|period|entry|session|deployment|bar|scenario|'
           r'headline|aggregate|funnel|info|fold|item|broker|total|combination|run|block|card|'
           r'symbol|check|warning|detail|instance|window')
FIELD = re.compile(r'\b(?:' + HOLDERS + r')\.([a-z][a-z0-9_]*)')
SKIP = ('value', 'label', 'currency', 'length', 'key', 'rows', 'open', 'map', 'filter', 'find',
        'join')
# Above this a display string is a sentence rather than a label — see `labelled_readings`.
LABEL_WORD_CAP = 5

CONSOLE_LABEL = re.compile(r'["\']\s*([A-Z][A-Za-z0-9 /&%().\'-]{1,30}?):\s*(?:\{|\s*["\'])')

def fields_in(text):
    found = []
    for candidate in FIELD.findall(text):
        if candidate not in found and candidate not in SKIP:
            found.append(candidate)
    return found


def labelled_readings(text, label, expression):
    """(label, field) where a label stands directly beside the value it names.

    `label: t('…')` is a declaration and names its field in the lines below it. The same statement
    is made in two other syntaxes, and both were invisible here:

      `{{ t('resolved') }} {{ f(x)!.total_resolved }}`   in a template
      `${t('commission')} ${row.commission_cost}`        in a template literal in the script

    The first cost us every rename contract 23 brought to the Orders funnel — five fields, and this
    check stayed silent. The second was found when this very file's author added such a string and
    noticed the register could not see it.

    The adjacency IS the rule, and it is deliberately strict: only the readings between this label
    and the NEXT one belong to it. A label with no reading after it is prose or a section heading
    rather than a word naming a field — measured over `src/`, 124 of 143 template labels are exactly
    that, and registering them would assert pairs nobody can defend.
    """
    found = []
    for match in label.finditer(text):
        # a SENTENCE is not a label, and the reading after it is whatever the sentence introduces.
        # Measured 2026-10-08 over the 167 register labels: the longest is FOUR words, so the cap
        # rejects nothing real and removes the worst class of false pair.
        if len(match.group(1).split()) > LABEL_WORD_CAP:
            continue
        tail = text[match.end():]
        following = label.search(tail)
        window = tail[:following.start()] if following else tail
        for found_expression in expression.findall(window):
            names = [name for name in READING.findall(found_expression) if name not in SKIP]
            if names:
                found.append((match.group(1), names[0]))
                break
    return found


def read_lines(path):
    with open(path, encoding='utf-8') as handle:
        return handle.read().split('\n')


def declared_window(lines, index, after):
    """The text a DECLARED label may name a field in: its own entry and nothing past it.

    It stops at the next `label:` or at the line that closes this object entry, because a figure
    array puts the next label's fields three lines away and a four-line window simply took them.
    Measured 2026-10-08: the wide window gave 78 of 146 labels a second field and almost all of
    them belonged to the NEXT label — `Net P&L` collected `profit_factor, total_trades, win_rate`,
    which are the three figures below it. The narrow window leaves 44, and those are the labels
    that genuinely render several: `Max drawdown` with its percentage, `Maker / taker`,
    `Long / short`, `Executed` with `orders_sent`.

    It also corrected one primary field: `Started (UTC)` had been paired with `ticks_from`, which
    sits on the same line and is a different figure entirely.
    """
    window = [lines[index][after:]]
    for line in lines[index + 1:index + 8]:
        if LABEL.search(line):
            break
        window.append(line)
        if ENTRY_END.match(line):
            break
    return ' '.join(window)


def our_pairs():
    """(label, fields) for every display label that names served fields.

    Three shapes, and the second is why the `rank` is read: a ListColumn array holds the headings
    and the row template holds the cells, far apart but in the same order. Both sides declare the
    rank of each column, and a unit test already holds the two equal — so the positional zip
    verifies itself, and a disagreement is dropped rather than paired wrongly.

    The third is `labelled_readings` — a label written in template text or in a template literal
    rather than declared. It is read LAST, so both declaration shapes outrank it.

    **The value is a LIST, because a label may name several fields and `Executed` is why.** It
    renders `orders_executed / orders_sent`; only the first was recorded, contract 23 removed the
    second, and the check stayed silent while `Executed 22/undefined` sat on screen for four days.
    A single string could not have carried it, and a "primary plus secondary" split would have
    invented a rank that `Max drawdown` and its percentage do not have.
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
                inline += labelled_readings(line, INLINE_LABEL, MUSTACHE)
                # a template literal wraps across the concatenation, so the reading often sits on
                # the next line; the window is two lines and `setdefault` absorbs the overlap
                inline += labelled_readings(' '.join(lines[index:index + 2]),
                                            TEMPLATE_LABEL, TEMPLATE_EXPR)
                match = LABEL.search(line)
                if match:
                    found = fields_in(declared_window(lines, index, match.end()))
                    # the rank sits in the column's OWN entry, which is the window the
                    # fields already use — a fixed three lines missed every column carrying a
                    # `hint`, because the hint pushes `rank` to the fourth line. Measured
                    # 2026-10-09: `Order id` and `Type` of the orders list, silently unresolved.
                    rank = RANK_ON_COLUMN.search(declared_window(lines, index, match.end()))
                    if found:
                        pairs.setdefault(match.group(1), found)
                    else:
                        columns.append((match.group(1), rank.group(1) if rank else '-'))
                if CELL.search(line):
                    cells.append((CELL.search(line).group(1),
                                  fields_in(' '.join(lines[index:index + 2]))))
            if columns and len(columns) == len(cells):
                for (label, rank), (cell_rank, found) in zip(columns, cells):
                    if rank == cell_rank and found:
                        pairs.setdefault(label, found)
                    else:
                        unresolved.append((path, label))
            else:
                unresolved += [(path, label) for label, _ in columns]
            # last, so both declaration shapes outrank it: a rank-verified column pair is a
            # stronger statement than two interpolations that happen to sit side by side
            for label, field in inline:
                pairs.setdefault(label, [field])
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


def recorded(entry):
    """The fields an entry names, as a LIST whichever form it is written in.

    One field is a bare string in the file and several are a list — see `baseline`. Every reader
    goes through here so the union stays a detail of the FILE and not of the logic.
    """
    field = entry.get('field')
    if not field:
        return []
    return [field] if isinstance(field, str) else list(field)


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
        # ONE field stays a bare string and several become a list. A union in a data file is worth
        # the small irregularity: writing every entry as a list would have moved all 146 lines of a
        # file the operator reads line by line, to say nothing new about the 102 that name one field.
        entries[label] = {
            'field': field[0] if len(field) == 1 else field,
            # the document of the LEADING field — the one the label is about
            'doc': docs.get(field[0]),
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
            findings.append(f'  NEW      "{label}" renders {", ".join(field)} '
                            'and the register does not know it')
        elif recorded(known) and recorded(known) != field:
            findings.append(f'  MOVED    "{label}" now renders {", ".join(field)}, '
                            f'the register says {", ".join(recorded(known))}')

    if docs is None:
        findings.append(f'  SKIPPED  {THEIR_DOCS} is absent — run sync_ide_docs.sh; '
                        'the documentation half was NOT checked')
    else:
        for label, known in sorted(register.items()):
            note = known.get('note') or ''
            # `undocumented` is a note somebody wrote after looking: the field is served and their
            # consumer layer does not describe it, which is a question for the backend rather than
            # a finding to repeat on every run. It stays visible in the register, not in the output.
            if note.startswith(('unresolved', 'undocumented')):
                continue
            # EVERY field the label renders, not only the leading one — `Executed` renders
            # `orders_executed / orders_sent` and it was the SECOND that contract 23 removed.
            for field in recorded(known):
                # The changelog is not evidence of existence, and this is the whole reason GONE
                # could never fire: contract 23 removed `orders_sent` and `total_resolved`, and the
                # document announcing their removal still NAMES them. A field only the log knows
                # is gone.
                if docs.get(field) in (None, HISTORY_ONLY):
                    findings.append(f'  GONE     {field} ("{label}") is in no consumer document '
                                    'any more')

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
