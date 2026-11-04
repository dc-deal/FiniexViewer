<script setup lang="ts">
/**
 * A heading that parts a panel into blocks — one account currency from the next, one unit from
 * another: its words at the panel's own size, centred, a rule to either side. The rule is what
 * sets it apart, never a larger size: every text in the app stands at one size.
 *
 * The slot takes the words, and what stands in their line, such as a scope mark.
 */
</script>

<template>
  <h3 class="rule-heading">
    <span class="rule-heading-words"><slot /></span>
  </h3>
</template>

<style scoped>
.rule-heading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin: var(--space-sm) 0 0;
  font-weight: normal;
  color: var(--color-text-primary);
}

.rule-heading::before,
.rule-heading::after {
  content: '';
  flex: 1;
  min-width: var(--space-md);
  border-top: 1px solid var(--color-border);
}

.rule-heading-words {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-sm);
  min-width: 0;
}
</style>
