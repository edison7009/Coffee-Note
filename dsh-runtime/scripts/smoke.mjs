import { mkdtemp, rm } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sessionRoot = await mkdtemp(path.join(os.tmpdir(), 'coffee-note-dsh-'))
const token = 'smoke-test-token'
const modelRequests = []
const modelServer = http.createServer((request, response) => {
  let body = ''
  request.setEncoding('utf8')
  request.on('data', chunk => { body += chunk })
  request.on('end', () => {
    modelRequests.push(JSON.parse(body))
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    const base = {
      id: 'chatcmpl-coffee-note-smoke',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'deepseek-chat',
    }
    response.write(`data: ${JSON.stringify({
      ...base,
      choices: [{ index: 0, delta: { role: 'assistant', content: 'pong' }, finish_reason: null }],
    })}\n\n`)
    response.write(`data: ${JSON.stringify({
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
    })}\n\n`)
    response.end('data: [DONE]\n\n')
  })
})
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
  await new Promise((resolve, reject) => {
    modelServer.once('error', reject)
    modelServer.listen(0, '127.0.0.1', resolve)
  })
  const address = bridge.address()
  const modelAddress = modelServer.address()
  const provider = {
    'coffee-note': {
      apiKeyEnv: 'COFFEE_NOTE_DSH_API_KEY',
      displayName: 'Coffee Note Smoke',
      api: 'openai-completions',
      baseURL: `http://127.0.0.1:${modelAddress.port}/v1`,
      reasoning: 'medium',
      models: [{
        id: 'deepseek-chat',
        contextWindow: 32768,
        maxTokens: 4096,
        input: ['text'],
        reasoningEfforts: { medium: 'medium' },
      }],
    },
  }
  const runTurn = async promptText => {
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
    let streamedText = ''
    let sawRunning = false
    let idleResolve
    const idle = new Promise(resolve => { idleResolve = resolve })
    lines.on('line', line => {
      const frame = JSON.parse(line)
      if (frame.id !== undefined) responses.get(frame.id)?.(frame)
      if (frame.method === 'session.status' && frame.params?.sessionId === 'smoke-session') {
        if (frame.params.status === 'running') sawRunning = true
        if (frame.params.status === 'idle' && sawRunning) idleResolve()
      }
      const event = frame.method === 'session.event' ? frame.params?.event : undefined
      if (event?.type === 'assistant/chunk' && event.data?.chunk?.type === 'text-delta') {
        streamedText += event.data.chunk.text
      }
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
    await request(2, 'session/prompt', {
      sessionId: 'smoke-session',
      contentBlocks: [{ type: 'text', text: promptText }],
    })
    let promptTimer
    try {
      await Promise.race([
        idle,
        new Promise((_, reject) => {
          promptTimer = setTimeout(() => reject(new Error(`prompt timed out\n${stderr}`)), 30000)
        }),
      ])
    } finally {
      clearTimeout(promptTimer)
    }
    if (streamedText !== 'pong') {
      throw new Error(`unexpected streamed response: ${JSON.stringify(streamedText)}\n${stderr}`)
    }
    await request(3, 'shutdown')
    child.stdin.end()
    await new Promise((resolve, reject) => {
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`runtime exited ${code}\n${stderr}`)))
    })
  }

  await runTurn('Reply with pong for turn 1.')
  await runTurn('Reply with pong for turn 2 after resuming this session.')
  if (modelRequests.length !== 2 || modelRequests.some(request => request.reasoning_effort !== 'medium')) {
    throw new Error(`reasoning configuration did not reach both model requests: ${JSON.stringify(modelRequests)}`)
  }
  const resumedHistory = JSON.stringify(modelRequests[1].messages)
  if (!resumedHistory.includes('turn 1') || !resumedHistory.includes('pong')) {
    throw new Error(`persisted session history was not resumed: ${resumedHistory}`)
  }
  process.stdout.write('Coffee Note DSH runtime smoke test passed.\n')
} finally {
  bridge.close()
  modelServer.close()
  await rm(sessionRoot, { recursive: true, force: true })
}
