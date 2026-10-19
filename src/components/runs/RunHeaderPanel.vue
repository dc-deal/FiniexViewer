<script setup lang="ts">
import { computed } from 'vue'
import JumpLink from '@/components/base/JumpLink.vue'
import { useOpenInContext } from '@/composables/use_open_in_context'
import type { ComponentIdentity, RepositoryIdentity, RunHeader, RunInfo } from '@/types/api/report_types'
import { utcInstant } from '@/components/runs/report_format'
import { plural, t } from '@/translate'

/**
 * TWO models, because they answer different questions and neither replaces the other.
 *
 * `info` is the index ROW and is never absent — it is what lets this panel answer for a run that
 * carries no report artifacts at all. `served` is the run HEADER (contract 26), which adds the two
 * things the row cannot: which code ran, and whether uncommitted code was explicitly allowed to
 * place real orders. Measured 2026-10-10: the header route answers 200 on all three logs-only runs
 * here, so in practice both halves are usually present — but an older run predates the block and
 * says so by absence rather than by a zero.
 */
const props = defineProps<{
  model: { info: RunInfo, served: RunHeader | null }
}>()

const info = computed(() => props.model.info)
const served = computed(() => props.model.served)
const { openDeployment, openSweep, canOpen } = useOpenInContext()

interface Membership {
  label: string
  id: string
  /** Opens the family, or null where nothing can open it yet. */
  open: (() => void) | null
}

/**
 * What the run belongs to, named for what that membership MEANS. `parent_id` carries two kinds of
 * parent — a sweep's children are alternatives that get ranked, a deployment's are consecutive
 * sessions of one bot's life — and `parent_kind` now SAYS which, so nothing here infers it from
 * `group` any more. A deployment's history can be opened, which turns the membership into a way in.
 */
const belongsTo = computed<Membership | null>(() => {
  const parentId = info.value.parent_id
  if (parentId === null) return null
  if (info.value.parent_kind === 'deployment') {
    return {
      label: t('Session of deployment'),
      id: parentId,
      open: canOpen ? () => openDeployment(parentId) : null,
    }
  }
  if (info.value.parent_kind === 'sweep') {
    return {
      label: t('Combination in sweep'),
      id: parentId,
      open: canOpen ? () => openSweep(parentId) : null,
    }
  }
  // a kind we do not know is still a membership — shown without claiming what it means
  return { label: t('Belongs to'), id: parentId, open: null }
})

/**
 * Every repository the run recorded, the framework first. Their own shape puts it on its own key
 * and the others in a list; a reader wants one ladder, and the framework is simply the first rung.
 */
interface NamedRepository {
  name: string
  held: RepositoryIdentity
}

const repositories = computed<NamedRepository[]>(() => {
  const code = served.value?.code_identity
  if (!code) return []
  // the framework carries `root: '.'`, which names nothing to a reader — their own structure calls
  // it the framework, so that is the word. The others say where they live, which is their root.
  return [
    { name: t('framework'), held: code.framework },
    ...code.repositories.map(held => ({ name: held.root, held })),
  ]
})

const components = computed<ComponentIdentity[]>(() => served.value?.code_identity?.components ?? [])

/**
 * What a dirty repository SAYS, in one line. The count is `uncommitted_count` and never the length
 * of `changes`: measured 2026-10-10 on the fixture run, the list holds 20 entries against a count
 * of 118, because the backend serves the first of them rather than all. Reading the list as the
 * count would understate it by eighty-eight.
 */
function changeNote(repository: RepositoryIdentity): string {
  return plural(repository.uncommitted_count, t('uncommitted change'), t('uncommitted changes'))
}

/** The sample of changed paths, for the hover. Their own words, one per line. */
function changeSample(repository: RepositoryIdentity): string {
  const shown = repository.changes.join('\n')
  if (repository.changes.length >= repository.uncommitted_count) return shown
  return `${shown}\n…${t('and more')}`
}

/** A component names itself by role, name and version; the file it came from is one hover away. */
function componentTitle(component: ComponentIdentity): string {
  const where = component.repository === '.' ? component.source_path
    : `${component.repository}/${component.source_path}`
  return `${t('Source')}: ${where}`
}
</script>

<template>
  <dl class="meta">
    <dt>{{ t('Run') }}</dt>
    <dd class="mono">{{ info.run_id }}</dd>

    <dt>{{ t('Started') }}</dt>
    <dd class="mono">{{ utcInstant(info.start_time) }}</dd>

    <!-- THEIR word, from `run-header`. The run list says the same word now. -->
    <dt>{{ t('Pipeline') }}</dt>
    <dd>{{ info.group }}</dd>

    <dt>{{ t('Name') }}</dt>
    <dd>{{ info.name }}</dd>

    <template v-if="belongsTo">
      <dt>{{ belongsTo.label }}</dt>
      <dd class="mono">
        <JumpLink
          v-if="belongsTo.open"
          :title="t('Open the deployment history')"
          @click="belongsTo.open?.()"
        >{{ belongsTo.id }}</JumpLink>
        <template v-else>{{ belongsTo.id }}</template>
      </dd>
    </template>

    <dt>{{ t('App version') }}</dt>
    <dd class="mono">{{ info.app_version }} · {{ info.git_commit }}</dd>

    <template v-if="info.config_snapshot">
      <dt>{{ t('Configuration file') }}</dt>
      <dd class="mono">{{ info.config_snapshot }}</dd>
    </template>

    <!--
      WHO STARTED THE RUN. Every label here is theirs, taken from `run-header` as instructed, and
      the block appears only where the run recorded one — an older run predates it.
    -->
    <template v-if="served?.origin">
      <dt>{{ t('Started via') }}</dt>
      <dd>{{ served.origin.channel }}</dd>

      <dt>{{ t('Client') }}</dt>
      <dd>{{ served.origin.client }}</dd>

      <dt>{{ t('Started for') }}</dt>
      <dd>{{ served.origin.principal }}</dd>

      <dt>{{ t('Host') }}</dt>
      <dd class="mono">{{ served.origin.host }}</dd>

      <!-- Only when TRUE, and then in the warning role with its own word. It says real orders were
           explicitly allowed from code that was not committed, which is a thing to weigh before
           trusting the figures beside it. False is the ordinary case and states nothing. -->
      <template v-if="served.origin.allow_dirty">
        <dt>{{ t('Uncommitted code allowed') }}</dt>
        <dd class="flagged">⚠ {{ t('yes') }}</dd>
      </template>
    </template>
  </dl>

  <!--
    WHICH CODE RAN. The one thing the index row cannot carry, and the question a reader arrives
    with when a result looks wrong: was this even reproducible? Absent on a run that predates the
    block or was not commissioned to report.
  -->
  <section v-if="repositories.length" class="code">
    <h4>{{ t('Code') }}</h4>

    <p v-for="{ name, held: repository } in repositories" :key="name" class="repo">
      <span class="repo-root">{{ name }}</span>
      <span v-if="repository.commit" class="mono">{{ repository.commit }}</span>
      <span v-if="repository.branch" class="repo-branch">{{ repository.branch }}</span>
      <!-- a clean tree states nothing beyond its commit: the commit IS the statement -->
      <span
        v-if="repository.dirty"
        class="flagged"
        :title="changeSample(repository)"
      >⚠ {{ changeNote(repository) }}</span>
      <!-- whether the code can be put back exactly, which is the question the dirtiness raises -->
      <span v-if="repository.dirty && !repository.restorable" class="flagged">
        {{ t('not restorable') }}
      </span>
      <span
        v-else-if="repository.dirty && repository.patch_ref"
        class="quiet"
        :title="repository.patch_ref"
      >{{ t('patch kept') }}</span>
      <!-- a directory under no version control at all cannot even state a commit -->
      <span v-if="repository.in_repository === false" class="flagged">
        {{ t('not versioned') }}
      </span>
    </p>

    <p v-for="component in components" :key="component.role + component.name" class="component">
      <span class="component-role">{{ component.role }}</span>
      <span class="mono" :title="componentTitle(component)">{{ component.name }}</span>
      <span class="quiet">{{ component.version }}</span>
    </p>
  </section>
</template>

<style scoped>
.meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-xs) var(--space-md);
  margin: 0;
}

.meta dt {
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}

/* a value here wraps rather than widening the list, and a deployment id is no exception — the
   jump would keep its name on one line, so the name is let to wrap like every value beside it */
.meta dd :deep(.jump-name) {
  white-space: normal;
  overflow-wrap: anywhere;
}

.mono {
  font-family: monospace;
}

/* a second block rather than more rows of the first: these are records of ANOTHER kind — one per
   repository and one per component — and a definition list would claim each was a property of
   the run */
.code {
  margin-top: var(--space-md);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-sm);
}

.code h4 {
  margin: 0 0 var(--space-xs);
  font-size: var(--font-size-sm);
  font-weight: normal;
  color: var(--color-text-secondary);
}

.repo,
.component {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin: 0 0 var(--space-xs);
  font-size: var(--font-size-sm);
}

.repo-root {
  min-width: 6rem;
  color: var(--color-text-primary);
}

.repo-branch,
.quiet {
  color: var(--color-text-secondary);
}

/* the role is a category and reads as one: boxed, the same device the run list uses for its marks */
.component-role {
  min-width: 6rem;
  padding: 0 var(--space-xs);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  line-height: 1;
  color: var(--color-text-secondary);
}

/* the warning role, and it never travels without its glyph and its word */
.flagged {
  color: var(--color-warning);
}
</style>
