import { defineStore } from 'pinia'
import { ref } from 'vue'
import { onContractStamp } from '@/api/api_client'

/**
 * Which contract the server serves, from the stamp on its latest answer — no request of its own.
 *
 * Two installations can serve two contracts: a server left on a release while this viewer moves on,
 * or a backend restarted under a newer one while a tab stays open. The viewer mirrors one contract,
 * so a field that moved between the two reads wrong or not at all, and nothing on a panel shows it.
 */
export const useServerContractStore = defineStore('server_contract', () => {
  /** The stamped contract; null until an answer arrived. */
  const served = ref<number | null>(null)

  onContractStamp(contract => { served.value = contract })

  return { served }
})
