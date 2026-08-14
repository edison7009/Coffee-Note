import net from 'node:net'

export const inject = ['tools']

function bridgeRequest(method, params, signal) {
  const address = process.env.COFFEE_NOTE_TOOL_BRIDGE_ADDR
  const token = process.env.COFFEE_NOTE_TOOL_BRIDGE_TOKEN
  if (!address || !token) {
    throw new Error('Coffee Note tool bridge is not configured')
  }

  const separator = address.lastIndexOf(':')
  const host = address.slice(0, separator)
  const port = Number(address.slice(separator + 1))

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    let settled = false
    let buffered = ''

    const finish = (error, value) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      socket.destroy()
      if (error) reject(error)
      else resolve(value)
    }
    const onAbort = () => finish(new Error('Tool call cancelled'))

    signal?.addEventListener('abort', onAbort, { once: true })
    socket.setEncoding('utf8')
    socket.setTimeout(125000, () => finish(new Error('Coffee Note tool bridge timed out')))
    socket.on('error', finish)
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ token, method, params })}\n`)
    })
    socket.on('data', chunk => {
      buffered += chunk
      const newline = buffered.indexOf('\n')
      if (newline < 0) return
      try {
        const response = JSON.parse(buffered.slice(0, newline))
        if (!response.ok) finish(new Error(response.error || 'Coffee Note tool failed'))
        else finish(undefined, response.result)
      } catch (error) {
        finish(error)
      }
    })
    socket.on('end', () => {
      if (!settled) finish(new Error('Coffee Note tool bridge closed without a response'))
    })
  })
}

export async function apply(ctx) {
  const definitions = await bridgeRequest('tools/list', {})
  const disposers = definitions.map(definition => ctx.tools.register({
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    timeoutMs: 120000,
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const result = await bridgeRequest('tools/execute', {
        sessionId: String(exec.agent?.session.id ?? ''),
        name: definition.name,
        arguments: args,
      }, exec.signal)
      return typeof result === 'string' ? result : JSON.stringify(result)
    },
  }))

  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}
