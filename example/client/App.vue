<template>
  <div class="bg-gray-300 text-gray-900 min-h-dvh p-8">
    <form
      class="flex flex-col gap-4 border border-gray-900 p-4 bg-white rounded-md max-w-lg mx-auto"
    >
      <h1 class="text-2xl font-bold">Uppy Upload Test</h1>

      <Dashboard :uppy="uppy" />
    </form>
  </div>
</template>
<script setup lang="ts">
import { Dashboard } from '@uppy/vue'
import Uppy from '@uppy/core'
import umnAwsS3 from '@umn-cla/uppy-aws-s3'
import '@uppy/core/dist/style.min.css'
import '@uppy/dashboard/dist/style.min.css'
import '@uppy/drag-drop/dist/style.min.css'
import '@uppy/status-bar/dist/style.min.css'
import '@uppy/progress-bar/dist/style.min.css'

const uppy = new Uppy().use(umnAwsS3, {
  endpoint: 'http://localhost:3000',
  shouldUseMultipart: true,
})
</script>
<style scoped></style>
