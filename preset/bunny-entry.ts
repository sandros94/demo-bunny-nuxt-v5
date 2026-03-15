// @ts-ignore
import '#nitro/virtual/polyfills'
import { useNitroApp } from 'nitro/app'

import { serve } from 'srvx/bunny'

const nitroApp = useNitroApp()
let _fetch = nitroApp.fetch

const _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? '')

serve({
  port: Number.isNaN(_parsedPort) ? 3000 : _parsedPort,
  hostname: process.env.NITRO_HOST || process.env.HOST,
  fetch: _fetch,
})
