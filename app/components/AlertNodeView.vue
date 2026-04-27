<!--
  AlertNodeView.vue
  ----------------------------------------------------------------------------
  In-editor rendering for a Comark `::alert` block component, paired with
  `defineComarkVueComponent({ name: 'alert', ... })`.

  Under the new ComarkKit architecture, declared component props are
  first-class native PM attrs (no `comarkProps` carrier). For our alert:
  `type` and `title` ride directly on `node.attrs.type` / `node.attrs.title`.

  Responsibilities:
    - Render the alert visually using Nuxt UI tokens
    - Expose an editable slot via <NodeViewContent /> for the alert body
    - Edit props through a <UForm> inside a <UPopover>; submission calls
      `updateAttributes({ type, title })` directly on the node.
-->

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/vue-3'
import type { SelectItem } from '@nuxt/ui'

interface AlertProps {
  type: 'info' | 'warning' | 'success' | 'error'
  title: string
}

const props = defineProps<NodeViewProps>()

// Local form state — seeded from the current node attrs and kept in sync
// with external changes (undo/redo, setContent, etc.)
const state = reactive<AlertProps>(readPropsFromNode())

function readPropsFromNode(): AlertProps {
  const attrs = props.node.attrs as Partial<AlertProps>
  return {
    type: attrs.type ?? 'info',
    title: attrs.title ?? '',
  }
}

watch(
  () => [props.node.attrs.type, props.node.attrs.title],
  () => {
    const next = readPropsFromNode()
    // Avoid thrashing if nothing actually changed
    if (state.type !== next.type) state.type = next.type
    if (state.title !== next.title) state.title = next.title
  },
)

function onSubmit() {
  // Drop empty title so the Comark AST stays clean
  props.updateAttributes({
    type: state.type,
    title: state.title ? state.title : null,
  })
}

// Visual mapping from alert type to Nuxt UI tokens + icon. Full class names
// are spelled out so Tailwind's content scanner picks them up.
const VARIANTS = {
  info: {
    icon: 'i-lucide-info',
    wrapper: 'bg-info/10 border-info/30 text-info dark:bg-info/15 dark:text-info',
  },
  warning: {
    icon: 'i-lucide-triangle-alert',
    wrapper: 'bg-warning/10 border-warning/30 text-warning dark:bg-warning/15 dark:text-warning',
  },
  success: {
    icon: 'i-lucide-circle-check',
    wrapper: 'bg-success/10 border-success/30 text-success dark:bg-success/15 dark:text-success',
  },
  error: {
    icon: 'i-lucide-circle-x',
    wrapper: 'bg-error/10 border-error/30 text-error dark:bg-error/15 dark:text-error',
  },
} as const

const variant = computed(() => VARIANTS[state.type || 'info'])

const typeItems = [
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Success', value: 'success' },
  { label: 'Error', value: 'error' },
] as const satisfies SelectItem[]
</script>

<template>
  <NodeViewWrapper
    as="div"
    :class="[
      'group relative my-4 flex items-start gap-3 rounded-lg border p-4',
      variant.wrapper,
      { 'ring-2 ring-primary/40': selected },
    ]"
    data-comark-component="alert"
  >
    <UIcon :name="variant.icon" class="size-5 shrink-0 mt-0.5" />

    <div class="flex-1 min-w-0">
      <div v-if="state.title" class="font-semibold mb-1" contenteditable="false">
        {{ state.title }}
      </div>

      <!--
        NodeViewContent is the editable slot hole. The `as` prop controls
        the wrapping element — a div keeps block children happy.
      -->
      <NodeViewContent class="text-default *:my-0" as="div" />
    </div>

    <!-- Settings popover: hidden until hover or selection to stay out of the way -->
    <UPopover :ui="{ content: 'p-4 w-72' }" :content="{ side: 'top', align: 'end' }">
      <UButton
        icon="i-lucide-settings-2"
        color="neutral"
        variant="ghost"
        size="xs"
        :class="[
          'shrink-0 transition-opacity',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        ]"
        contenteditable="false"
        @mousedown.prevent
      />

      <template #content>
        <UForm :state="state" class="space-y-3" @submit="onSubmit">
          <UFormField label="Type" name="type" required>
            <USelectMenu v-model="state.type" :items="typeItems" value-key="value" class="w-full" />
          </UFormField>

          <UFormField label="Title" name="title" help="Optional header shown above the content.">
            <UInput v-model="state.title" placeholder="e.g. Heads up" class="w-full" />
          </UFormField>

          <UButton type="submit" label="Apply" size="sm" block />
        </UForm>
      </template>
    </UPopover>
  </NodeViewWrapper>
</template>
