# Facet Bar

Every list in the viewer is narrowed by the same facet bar rather than by a cascade of dropdowns. Read this document before you give a list facets or change `FacetBar`, `facet_filter.ts` or `use_facet_state`: it states what a narrowing may and may not do, and what a bar keeps across a reload.

## Narrowing a list — one facet bar, and what it is not allowed to do

A run of forty scenarios breaks every view built for three. The answer is the arrangement a tracker
of thousands of rows uses: **a facet bar over a plain list**, nothing cleverer.

- **`src/components/base/facet_filter.ts`** — the whole behaviour as pure functions over rows the
  caller already has: `applyFacets`, `facetOptions`, `toggleValue`, `sortRows`. Testable without
  mounting anything.
- **`src/components/base/FacetBar.vue`** — generic over its row type. It owns no state: the caller
  holds the selection and applies the same pure functions, so the bar and the list can never
  disagree about what is shown.

**One line wherever it fits** (viewer#31, 2026-10-14). In a narrow panel the bar took three and four
lines before a single row of the list showed, so it was folded:

```
⌕  Pipeline ▾  Artifacts ▾  +6 3 ▾          ✕ clear   29 of 141   Sort: newest ▾
│  └ the facets that fit, in their order   │             │             └ a menu of the sorts
│                    the rest, behind +N ──┘             └ shown of all
└ the search, folded until asked for — open while it holds a term
```

- **The facets run in `base/OverflowRow.vue`** — one row that never wraps, its arithmetic in
  `overflow_fit.ts` and pure: those that fit stand in the row, in their order, and the rest wait
  behind `+N`, each there as a submenu with its values, their counts and its picks. The control carries the
  picks behind it as a count and wears the chosen look, so a narrowing out of sight still shows
  where the click happens.
- **The bar does not move when it is used.** Everything a use changes keeps the room of its widest
  state — `clear` is laid out while there is nothing to clear, the count at its most digits, the
  sort at its longest name, the count on `+N` at two digits — because the facets that fit are
  measured against what stands beside them, and a chip would otherwise go behind `+N` or come out
  from under the pointer.
- **At the narrowest the right-hand group takes a second line**, never a third; which line it takes
  depends on the panel's width alone. Measured 2026-10-15 on the run list: one line at 1400 and at
  700 px, two at 420 px.
- **`src/types/facet_types.ts`** — a `FacetDefinition` is the only place that knows what a row looks
  like, which is what lets one bar serve a scenario roster, a run index and a session list.

Four rules the implementation follows, each of which is a way a filter usually goes wrong:

- **Values within one facet are OR, different facets are AND.** Picking a second value of the same
  facet widens the question; picking in a second facet narrows it.
- **A facet counts against the OTHER facets, never against itself.** Counting against its own
  selection makes every unpicked value read 0 as soon as one is picked, and a reader can then never
  widen a choice without clearing it first. A picked value stays listed at 0 so it can be taken off.
- **A row that states no value is never claimed by one.** `market_type` is empty on every run
  recorded before the backend added it; such a row shows while the facet is open and drops as soon
  as a value is picked. An empty string is not a category. A facet that cannot narrow anything is
  drawn DISABLED rather than dropped: dropped, chips appeared and vanished mid-bar as values were
  picked, and the open panel moved out from under the pointer (measured on screen 2026-10-08).
- **The count is read against the whole list**, not against what survived — a filter that counts
  only its own result cannot say what it is hiding.

**Nothing here derives anything.** A facet's values come out of the row through the caller's own
`valuesOf`. Sorting a scenario list by net P&L is deliberately ABSENT: the roster carries no figures
and the response that does is a shorter list, so the sort would need those two merged into a third
thing — raised with FiniexTestingIDE on 2026-09-27 and waiting on their answer rather than worked
around here.

### A facet bar's state — `use_facet_state`

Each bar keeps its narrowing, its search and its sort under its own entry in `bars`. A bar nobody
touched stores nothing and opens on its defaults; an EMPTY selection means the reader cleared it,
and that is kept — a reload shows what they last saw rather than handing the default back. A
`scope` names what a narrowing was made FOR: the scenario roster's is the run, so a narrowing made
for another run is dropped on the way in and when the run changes under a mounted roster, while the
sort is kept.

**Why the search and the sort are kept too.** A search REMOVES rows, so it narrows like a facet. A
sort does not change the set, but these sorts are analytical — *worst result first*, *longest tick
timespan first* — and that is part of what the reader was looking at. Panel order, collapsed
sections and pinned panels stay in the layout's own key: those are how one reader arranged their
screen, not what they are looking at.
