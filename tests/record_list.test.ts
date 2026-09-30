import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import RecordList from '@/components/base/RecordList.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import type { ListBand, ListColumn, ListGroup } from '@/types/list_types'

interface Row {
  id: string
  unit: string
  net: number
}

const COLUMNS: ListColumn[] = [
  { label: 'Unit', width: 'minmax(0, 1fr)' },
  { label: 'Net', width: 'auto', figure: true },
]

const ROWS: Row[] = [
  { id: 'a', unit: 'alpha', net: 1 },
  { id: 'b', unit: 'beta', net: -2 },
  { id: 'c', unit: 'alpha', net: 3 },
]

/**
 * `RecordList` is a GENERIC single-file component: its row type is inferred where it is used in a
 * template. Through `mount` there is no template to infer from, so every slot scope arrives as
 * `unknown` and the type parameter is lost. These two narrow it once, here, rather than at each of
 * the six slots that would otherwise need it — the alternative is a host `.vue`, which
 * `tsconfig.tests.json` does not compile.
 */
function rowOf(scope: unknown): Row {
  return (scope as { row: Row }).row
}

function asRow(value: unknown): Row {
  return value as Row
}

function groupOf(scope: unknown): ListGroup<Row> {
  return (scope as { group: ListGroup<Row> }).group
}

interface ListProps {
  hideHead?: boolean
  inert?: boolean
  rowCard?: (row: unknown) => { title: string, details: { label: string, value: string }[] } | null
  isPicked?: (row: unknown) => boolean
  hasDetail?: (row: unknown) => boolean
  groupBy?: (row: unknown) => string
  isOpen?: (key: string) => boolean
  showsChildren?: (row: unknown) => boolean
  bands?: ListBand[]
  columns?: ListColumn[]
}

function mountList(props: ListProps = {}, slots: Record<string, unknown> = {}) {
  return mount(RecordList, {
    props: { rows: ROWS, columns: COLUMNS, rowKey: (row: unknown) => asRow(row).id, ...props },
    slots: {
      default: (scope: unknown) => [
        h('span', rowOf(scope).unit),
        h('span', String(rowOf(scope).net)),
      ],
      ...slots,
    },
  })
}

describe('RecordList — the flat list', () => {
  it('draws one row per record, under one set of headings', () => {
    const wrapper = mountList()
    expect(wrapper.findAll('.record-head')).toHaveLength(1)
    expect(wrapper.findAll('.record-row')).toHaveLength(3)
    expect(wrapper.findAll('.record-group')).toHaveLength(0)
  })

  /**
   * The tracks are declared ONCE on the list and adopted by every row through `subgrid`. Measured
   * 2026-09-29: with a grid on each row instead, the figures drifted 99 px across fourteen rows.
   * So the tracks belonging to the list, and not to a row, is the load-bearing part.
   */
  it('owns the grid tracks itself', () => {
    const wrapper = mountList()
    expect(wrapper.find('.record-list').attributes('style'))
      .toContain('--list-tracks: minmax(0, 1fr) auto')
  })

  /**
   * A row that CAN be chosen is a toggle, and a reader who cannot see the marked edge needs the
   * state said out loud. Absent where the caller has no notion of choosing, so an ordinary list of
   * records does not announce itself as a row of buttons that remember something.
   */
  it('announces a chosen row as chosen, and only where rows can be chosen', () => {
    const picking = mountList({ isPicked: (row: unknown) => asRow(row).id === 'b' })
    const rows = picking.findAll('.record-row')
    expect(rows[0]!.attributes('aria-pressed')).toBe('false')
    expect(rows[1]!.attributes('aria-pressed')).toBe('true')

    expect(mountList().find('.record-row').attributes('aria-pressed')).toBeUndefined()
  })

  it('reports which row was clicked', async () => {
    const wrapper = mountList()
    await wrapper.findAll('.record-row')[1]!.trigger('click')
    expect(wrapper.emitted('pick')?.[0]?.[0]).toMatchObject({ id: 'b' })
  })

  it('draws a spanning detail line only where the caller says there is one', () => {
    const wrapper = mountList(
      { hasDetail: (row: unknown) => asRow(row).net < 0 },
      { detail: (scope: unknown) => h('span', `failed: ${rowOf(scope).id}`) },
    )
    const details = wrapper.findAll('.record-detail')
    expect(details).toHaveLength(1)
    expect(details[0]!.text()).toBe('failed: b')
  })
})

describe('RecordList — the card beside a row', () => {
  /**
   * The LIST wraps the row, not the caller: reka-ui's trigger takes a single element and that
   * element is the row button, which this component owns so the four states and the focus ring live
   * in one place. The caller only has eight sibling cells to offer.
   */
  it('wraps a row whose caller has more to say than the columns hold', () => {
    const wrapper = mountList({
      rowCard: (row: unknown) => ({
        title: asRow(row).unit,
        details: [{ label: 'Net', value: String(asRow(row).net) }],
      }),
    })
    expect(wrapper.findAllComponents(HoverCard)).toHaveLength(3)
  })

  /**
   * Not merely tidiness: wrapping unconditionally would mount a tooltip context per row — five
   * hundred of them on a long trade list, for a list that offers no card at all.
   */
  it('mounts no card machinery at all where no card was offered', () => {
    expect(mountList().findAllComponents(HoverCard)).toHaveLength(0)
  })

  it('offers no card for a row the caller answers null for', () => {
    const wrapper = mountList({
      rowCard: (row: unknown) => asRow(row).net < 0
        ? { title: 'loss', details: [] }
        : null,
    })
    expect(wrapper.findAllComponents(HoverCard)).toHaveLength(1)
  })
})

describe('RecordList — groups', () => {
  const groupBy = (row: unknown) => asRow(row).unit
  const groupSlot = { group: (scope: unknown) => h('span', groupOf(scope).key) }

  /**
   * Groups appear in the order their FIRST row does, so the sort the reader chose above the list
   * decides their order too. A group order of the component's own would silently override it.
   */
  it('partitions in the order the rows arrive, not alphabetically', () => {
    const wrapper = mountList({ groupBy }, groupSlot)
    const keys = wrapper.findAll('.record-group').map(button => button.text())
    expect(keys).toEqual(['alpha', 'beta'])
    expect(wrapper.findAll('.record-row')).toHaveLength(3)
  })

  it('draws the heading of a closed group but none of its rows', () => {
    const wrapper = mountList(
      { groupBy, isOpen: (key: string) => key !== 'alpha' },
      groupSlot,
    )
    expect(wrapper.findAll('.record-group')).toHaveLength(2)
    expect(wrapper.findAll('.record-row')).toHaveLength(1)
  })

  it('reports the clicked heading by its key, holding no state of its own', async () => {
    const wrapper = mountList({ groupBy }, groupSlot)
    await wrapper.findAll('.record-group')[1]!.trigger('click')
    expect(wrapper.emitted('toggle')?.[0]?.[0]).toBe('beta')
  })

  /**
   * The heading is a NATIVE button, and that is the whole reason the panel above no longer carries
   * a `tabindex` with hand-written enter and space handlers: activation belongs to the platform.
   * This assertion is what the deleted panel test was protecting, moved to where the behaviour now
   * lives — and `aria-expanded` is coverage the old `<tr>` never had at all.
   */
  it('makes the heading a control the platform already knows how to operate', () => {
    const heading = mountList({ groupBy }, groupSlot).find('.record-group')
    expect(heading.element.tagName).toBe('BUTTON')
    expect(heading.attributes('aria-expanded')).toBe('true')
  })

  it('tells a screen reader that a closed group is closed', () => {
    const wrapper = mountList({ groupBy, isOpen: () => false }, groupSlot)
    expect(wrapper.find('.record-group').attributes('aria-expanded')).toBe('false')
  })

  /**
   * Indenting the ROW would move every column out of the alignment this component exists to
   * produce, so only the first cell moves.
   */
  it('indents a grouped row by its first cell, never by the row', () => {
    const wrapper = mountList({ groupBy }, groupSlot)
    expect(wrapper.find('.record-row').classes()).toContain('grouped')
  })

  it('stays flat, with no heading at all, where no grouping was asked for', () => {
    expect(mountList().findAll('.record-group')).toHaveLength(0)
  })
})

describe('RecordList — nested and read-only', () => {
  /** A heading over every two fills labels what the cells already label inline. */
  it('draws no headings where the caller hid them', () => {
    expect(mountList({ hideHead: true }).findAll('.record-head')).toHaveLength(0)
  })

  /**
   * A row that looks like a control and does nothing is the same defect as a control that looks
   * disabled and works — so an inert row is not a button at all, rather than a button that ignores
   * its click.
   */
  it('draws a read-only row as no control at all', () => {
    const wrapper = mountList({ inert: true })
    expect(wrapper.find('.record-row').element.tagName).toBe('DIV')
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})

describe('RecordList — child records', () => {
  /**
   * A child is a record of ANOTHER kind that a row owns — a trade's fills — not a partition of the
   * same kind. It gets its own box rather than the list's tracks, because its columns are different
   * ones.
   */
  it('draws a row\'s children only where the caller says to draw them now', () => {
    const wrapper = mountList(
      { showsChildren: (row: unknown) => asRow(row).id === 'c' },
      { children: (scope: unknown) => h('span', `fills of ${rowOf(scope).id}`) },
    )
    const children = wrapper.findAll('.record-children')
    expect(children).toHaveLength(1)
    expect(children[0]!.text()).toBe('fills of c')
  })

  it('draws none at all where the caller offers no such notion', () => {
    expect(mountList().findAll('.record-children')).toHaveLength(0)
  })
})

/**
 * The bands over the headings, and the half of them that has to move with the ranks.
 *
 * A band's declared span counts the columns at the WIDEST tier. Under ranks the grid has fewer
 * tracks than that, so a fixed span reaches past the end of it — measured 2026-09-30 on the
 * booking periods at a 28rem panel: four bands demanded fourteen tracks of a four-track grid, the
 * browser grew implicit columns to fit them, and every band stood over the wrong columns.
 *
 * jsdom evaluates no container queries, so what is assertable here is the DECLARATION — that each
 * band carries a span for every tier. Whether the browser then acts on it is `e2e/list_ranks`.
 */
describe('RecordList — the bands over the headings', () => {
  const RANKED: ListColumn[] = [
    { label: 'Unit', width: 'auto', rank: 1 },
    { label: 'No', width: 'auto', rank: 3 },
    { label: 'Opened', width: 'auto', rank: 1 },
    { label: 'Closed', width: 'auto', rank: 2 },
  ]

  /** Two bands over four ranked columns: identity (Unit, No) and period (Opened, Closed). */
  const BANDS: ListBand[] = [{ label: 'Identity', span: 2 }, { label: 'Period', span: 2 }]

  function bandStyles(props: ListProps) {
    return mount(RecordList, {
      props: { rows: ROWS, columns: COLUMNS, rowKey: (row: unknown) => asRow(row).id, ...props },
      slots: { default: (scope: unknown) => [h('span', rowOf(scope).unit)] },
    }).findAll('.record-bands > span').map(node => node.attributes('style') ?? '')
  }

  it('draws one band per declaration, above the headings', () => {
    const wrapper = mountList({ bands: BANDS, columns: RANKED })
    expect(wrapper.findAll('.record-bands > span')).toHaveLength(2)
    expect(wrapper.find('.record-bands').text()).toContain('Identity')
  })

  /**
   * Every tier, on the band itself. The container query picks one for all the bands at once, which
   * is what makes it expressible at all: the stem does not know how many bands a caller declares.
   */
  it('gives each band the span it keeps at every tier', () => {
    const styles = bandStyles({ bands: BANDS, columns: RANKED })
    // Identity: Unit survives everything, No goes at tier 2 — so 1, 1, 2, 2
    expect(styles[0]).toContain('--s1: 1')
    expect(styles[0]).toContain('--s2: 1')
    expect(styles[0]).toContain('--s3: 2')
    expect(styles[0]).toContain('--s4: 2')
    // Period: Opened survives everything, Closed goes at tier 1 — so 1, 2, 2, 2
    expect(styles[1]).toContain('--s1: 1')
    expect(styles[1]).toContain('--s2: 2')
  })

  /** An unranked list has one tier, and the declared span is it at every width. */
  it('keeps the declared span where no column is ranked', () => {
    const styles = bandStyles({ bands: [{ label: 'Both', span: 2 }] })
    for (const tier of [1, 2, 3, 4]) expect(styles[0]).toContain(`--s${tier}: 2`)
  })

  /**
   * A band off by one sits over the wrong column and nothing on screen says so, which is how the
   * table this replaced ended up nine columns wide in an eight-column layout. Drawing none is the
   * loud failure.
   */
  it('draws no bands at all where the spans do not cover the columns', () => {
    const wrapper = mountList({ bands: [{ label: 'Short', span: 1 }], columns: RANKED })
    expect(wrapper.findAll('.record-bands')).toHaveLength(0)
  })

  /**
   * A band that keeps NO column cannot be drawn — `span 0` is not a span — and patching it to one
   * would put it over somebody else's column. Reported, because the caller's ranks need changing.
   */
  it('draws no bands where one would lose every column when narrow', () => {
    const wrapper = mountList({
      bands: [{ label: 'Goes entirely', span: 2 }, { label: 'Stays', span: 2 }],
      columns: [
        { label: 'a', width: 'auto', rank: 4 },
        { label: 'b', width: 'auto', rank: 3 },
        { label: 'c', width: 'auto', rank: 1 },
        { label: 'd', width: 'auto', rank: 1 },
      ],
    })
    expect(wrapper.findAll('.record-bands')).toHaveLength(0)
  })
})
