<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import AppButton from '@/components/base/AppButton.vue'
import AppSelect from '@/components/base/AppSelect.vue'
import AppSwitch from '@/components/base/AppSwitch.vue'
import FigureBlock from '@/components/base/FigureBlock.vue'
import HintLine from '@/components/base/HintLine.vue'
import RecordList from '@/components/base/RecordList.vue'
import { serverName, useServersStore } from '@/stores/servers_store'
import type { ServerProbe } from '@/api/servers_api'
import type { Figure } from '@/types/figure_types'
import type { ListColumn } from '@/types/list_types'
import type { ServerEdit, ServerEntry, ServerTunnel, TunnelState } from '@/types/server_types'
import { t } from '@/translate'

/**
 * The servers as a list with a detail. A token can be set here and never read back: it goes straight to
 * the dev server, and the browser keeps nothing of it. What is changed here goes to this machine's own
 * `user_configs`, and never into the tracked defaults. The default server cannot be removed.
 */
const store = useServersStore()
const { servers, secretFiles } = storeToRefs(store)

/** A new server's draft has no entry yet, and is `null` as what it would be saved under. */
const NEW = '__new'
const picked = ref<string>(store.activeId)
const entry = computed<ServerEntry | null>(() => servers.value.find(server => server.id === picked.value) ?? null)

const BLANK_TUNNEL: ServerTunnel = { account: '', host: '', localPort: 8010, remotePort: 8000, keyFile: '', knownHostsFile: '' }

const name = ref('')
const url = ref('')
const token = ref('')
const hasTunnel = ref(false)
const tunnel = ref<ServerTunnel>({ ...BLANK_TUNNEL })
const probe = ref<ServerProbe | null>(null)
const problem = ref<string | null>(null)
const confirmingRemoval = ref(false)
const busy = ref(false)

const isNew = computed(() => picked.value === NEW)
const isDefault = computed(() => entry.value?.isDefault ?? false)

// a picked row fills the form; the token field always starts empty, because it cannot be read back
watch([picked, entry], () => {
  name.value = entry.value?.name ?? ''
  url.value = entry.value?.url ?? ''
  token.value = ''
  hasTunnel.value = entry.value?.tunnel != null
  tunnel.value = { ...(entry.value?.tunnel ?? BLANK_TUNNEL) }
  problem.value = null
  confirmingRemoval.value = false
}, { immediate: true })

watch(picked, () => { probe.value = null })

const columns: ListColumn[] = [{ label: t('Server'), width: 'minmax(0, 1fr)' }]

const fileOptions = computed(() => secretFiles.value.map(file => ({ value: file, label: file })))

const tokenPlaceholder = computed(() => (entry.value?.hasToken ? t('Set, enter a new one to replace it') : t('None set')))

const probeFigures = computed<Figure[]>(() => {
  const found = probe.value
  if (!found?.connected) return []
  const rows: Figure[] = [
    { label: t('Version'), value: found.health?.version ?? t('n/a') },
    { label: t('Contract'), value: found.contract === null ? t('n/a') : String(found.contract) },
    { label: t('Identity'), value: found.hostId ?? t('not identified yet') },
  ]
  if (found.caller) {
    rows.push({ label: t('Account'), value: found.caller.display_name ?? found.caller.account ?? t('n/a') })
    rows.push({ label: t('Grants'), value: (found.caller.grants ?? []).join(' · ') })
  }
  return rows
})

/** How the tunnel stands, in words, and the last thing ssh said. Nothing while there is none. */
const tunnelNote = computed(() => {
  const state = entry.value?.tunnelState
  if (!state || state === 'none') return null
  const words: Record<Exclude<TunnelState, 'none'>, string> = {
    missing_files: t('Tunnel: its key files are missing'),
    no_ssh: t('Tunnel: ssh is not available here'),
    connecting: t('Tunnel: starting'),
    running: t('Tunnel: running'),
    retrying: t('Tunnel: ended, starting again'),
  }
  return [words[state], entry.value?.tunnelMessage].filter(Boolean).join(' · ')
})

function editOf(): ServerEdit {
  const edit: ServerEdit = { name: name.value.trim() || null, url: url.value.trim() }
  edit.tunnel = hasTunnel.value ? { ...tunnel.value } : null
  if (token.value) edit.token = token.value
  return edit
}

async function attempt(action: () => Promise<void>, failure: string): Promise<void> {
  busy.value = true
  problem.value = null
  try {
    await action()
  } catch {
    problem.value = failure
  } finally {
    busy.value = false
  }
}

function save(): Promise<void> {
  return attempt(async () => {
    const before = servers.value.map(server => server.id)
    await store.save(isNew.value ? null : picked.value, editOf())
    token.value = ''
    if (isNew.value) picked.value = servers.value.find(server => !before.includes(server.id))?.id ?? store.activeId
  }, t('Not saved: check the address and the tunnel'))
}

function check(): Promise<void> {
  return attempt(async () => {
    probe.value = await store.check(picked.value)
  }, t('The check could not run'))
}

function remove(): Promise<void> {
  if (!confirmingRemoval.value) {
    confirmingRemoval.value = true
    return Promise.resolve()
  }
  return attempt(async () => {
    const id = picked.value
    picked.value = store.activeId === id ? servers.value[0]!.id : store.activeId
    await store.remove(id)
  }, t('Not removed'))
}
</script>

<template>
  <div class="servers">
    <HintLine id="servers" />
    <div class="servers-body">
      <div class="servers-list">
        <RecordList
          :rows="servers"
          :columns="columns"
          :row-key="row => row.id"
          :is-picked="row => row.id === picked"
          @pick="row => { picked = row.id }"
        >
          <template #default="{ row }">
            <span class="server-row" :data-server="row.id">{{ serverName(row) }}</span>
          </template>
        </RecordList>
        <AppButton data-action="new-server" @click="picked = NEW">+ {{ t('New server') }}</AppButton>
      </div>

      <form class="server-detail" @submit.prevent="save">
        <label class="field">
          <span class="field-label">{{ t('Name') }}</span>
          <input v-model="name" class="field-input" name="server-name" :placeholder="entry ? serverName(entry) : ''">
        </label>
        <label class="field">
          <span class="field-label">{{ t('Address') }}</span>
          <input
            v-model="url"
            class="field-input"
            name="server-url"
            placeholder="http://localhost:8010/api/v1"
          >
        </label>
        <label class="field">
          <span class="field-label">{{ t('Token') }}</span>
          <input
            v-model="token"
            class="field-input"
            name="server-token"
            type="password"
            autocomplete="off"
            :placeholder="tokenPlaceholder"
          >
        </label>

        <template v-if="!isDefault">
          <AppSwitch v-model="hasTunnel" :label="t('Through an SSH tunnel')" />
          <div v-if="hasTunnel" class="tunnel">
            <label class="field">
              <span class="field-label">{{ t('Account') }}</span>
              <input v-model="tunnel.account" class="field-input" name="tunnel-account" autocomplete="off">
            </label>
            <label class="field">
              <span class="field-label">{{ t('Host') }}</span>
              <input v-model="tunnel.host" class="field-input" name="tunnel-host" autocomplete="off">
            </label>
            <label class="field">
              <span class="field-label">{{ t('Local port') }}</span>
              <input v-model.number="tunnel.localPort" class="field-input" name="tunnel-local-port" type="number">
            </label>
            <label class="field">
              <span class="field-label">{{ t('Port on the host') }}</span>
              <input v-model.number="tunnel.remotePort" class="field-input" name="tunnel-remote-port" type="number">
            </label>
            <div class="field">
              <span class="field-label">{{ t('Key file') }}</span>
              <AppSelect v-model="tunnel.keyFile" :options="fileOptions" />
            </div>
            <div class="field">
              <span class="field-label">{{ t('Host key file') }}</span>
              <AppSelect v-model="tunnel.knownHostsFile" :options="fileOptions" />
            </div>
          </div>
        </template>

        <p v-if="tunnelNote" class="server-note" data-state="tunnel">{{ tunnelNote }}</p>

        <div class="server-actions">
          <AppButton type="submit" :disabled="busy">{{ isNew ? t('Add server') : t('Save') }}</AppButton>
          <AppButton v-if="!isNew" type="button" data-action="check-server" :disabled="busy" @click="check">
            {{ t('Check connection') }}
          </AppButton>
          <AppButton v-if="!isNew && !isDefault" type="button" data-action="remove-server" :disabled="busy" @click="remove">
            {{ confirmingRemoval ? t('Really remove') : t('Remove') }}
          </AppButton>
        </div>

        <p v-if="problem" class="server-problem">⚠ {{ problem }}</p>
        <p v-if="probe && !probe.connected" class="server-problem" data-state="no-connection">
          ⚠ {{ t('No connection to this server: tunnel or host') }}
        </p>
        <p v-if="probe?.tokenRefused" class="server-problem" data-state="token-refused">
          ⚠ {{ t('The server answers and does not accept this token') }}
        </p>
        <FigureBlock v-if="probeFigures.length" :figures="probeFigures" />
      </form>
    </div>
  </div>
</template>

<style scoped>
.servers {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-height: 0;
}

/* side by side where the dialog has the room, one above the other where it has not */
.servers-body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-md);
  min-height: 0;
}

.servers-list {
  flex: 1 1 11rem;
  max-width: 16rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-sm);
  min-width: 0;
}

.servers-list :deep(.record-shell) {
  width: 100%;
}

.server-row {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-detail {
  flex: 3 1 20rem;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-width: 0;
}

.tunnel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
}

.field-label {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.field-input {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: var(--space-xs) var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  width: 100%;
  outline: none;
}

.field-input:focus {
  border-color: var(--color-accent);
}

.server-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.server-note {
  margin: 0;
  color: var(--color-text-secondary);
  font-family: monospace;
  font-size: var(--font-size-sm);
  overflow-wrap: anywhere;
}

.server-problem {
  margin: 0;
  color: var(--color-warning);
  font-family: monospace;
  font-size: var(--font-size-sm);
}
</style>
