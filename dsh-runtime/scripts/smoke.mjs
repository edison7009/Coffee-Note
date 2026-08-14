import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sessionRoot = await mkdtemp(path.join(os.tmpdir(), 'coffee-note-dsh-'))
const token = 'smoke-test-token'
const bridge = net.createServer(socket => {
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', chunk => {
    buffer += chunk
    const newline = buffer.indexOf('\n')
    if (newline < 0) return
    const request = JSON.parse(buffer.slice(0, newline))
    const response = request.token === token && request.method === 'tools/list'
      ? { ok: true, result: [] }
      : { ok: false, error: 'unexpected smoke bridge request' }
    socket.end(`${JSON.stringify(response)}\n`)
  })
})

try {
  await new Promise((resolve, reject) => {
    bridge.once('error', reject)
    bridge.listen(0, '127.0.0.1', resolve)
  })
  const address = bridge.address()
  const provider = {
    'coffee-note': {
      apiKeyEnv: 'COFFEE_NOTE_DSH_API_KEY',
      displayName: 'Coffee Note Smoke',
      api: 'openai-completions',
      baseURL: 'https://api.deepseek.com/v1',
      models: [{ id: 'deepseek-chat', contextWindow: 131072, maxTokens: 8192, input: ['text'] }],
    },
  }
  const child = spawn(process.execPath, [
    path.join(root, 'node_modules/@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/packaged-bin.js'),
    path.join(root, 'coffee-note.cordis.yml'),
  ], {
    cwd: root,
    env: {
      ...process.env,
      COFFEE_NOTE_DSH_PROVIDER: JSON.stringify(provider),
      COFFEE_NOTE_DSH_SYSTEM_PROMPT: 'Coffee Note smoke test.',
      COFFEE_NOTE_DSH_SESSION_ROOT: sessionRoot,
      COFFEE_NOTE_DSH_API_KEY: 'smoke-test-key',
      COFFEE_NOTE_TOOL_BRIDGE_ADDR: `127.0.0.1:${address.port}`,
      COFFEE_NOTE_TOOL_BRIDGE_TOKEN: token,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => { stderr += chunk })
  const lines = createInterface({ input: child.stdout })
  const responses = new Map()
  lines.on('line', line => {
    const frame = JSON.parse(line)
    if (frame.id !== undefined) responses.get(frame.id)?.(frame)
  })
  const request = (id, method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out\n${stderr}`)), 30000)
    responses.set(id, frame => {
      clearTimeout(timer)
      responses.delete(id)
      if (frame.error) reject(new Error(`${frame.error.message}\n${stderr}`))
      else resolve(frame.result)
    })
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })

  const initialized = await request(1, 'initialize', {
    cwd: root,
    provider: 'coffee-note',
    model: 'deepseek-chat',
    maxTokens: 4096,
  })
  if (initialized?.serverInfo?.name !== 'deepseek-harness-sdk-runtime') {
    throw new Error(`unexpected initialize response: ${JSON.stringify(initialized)}`)
  }
  await request(2, 'shutdown')
  child.stdin.end()
  await new Promise((resolve, reject) => {
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`runtime exited ${code}\n${stderr}`)))
  })
  process.stdout.write('Coffee Note DSH runtime smoke test passed.\n')
} finally {
  bridge.close()
  await rm(sessionRoot, { recursive: true, force: true })
}
