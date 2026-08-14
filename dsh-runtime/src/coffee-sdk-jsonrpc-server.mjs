import { HarnessSdkJsonRpcServer } from '@deepseek-ai/dsh-sdk-jsonrpc-server'
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol'

export const name = 'coffee-sdk-jsonrpc-server'
export const inject = ['agents']

class CoffeeNoteJsonRpcServer extends HarnessSdkJsonRpcServer {
  async createSession(sessionId) {
    const agentOptions = {
      provider: this.provider,
      model: this.model,
      ...(this.maxTokens === undefined ? {} : { maxTokens: this.maxTokens }),
    }
    const persistence = this.ctx.get('sessionPersistence')
    let handle

    if (persistence !== undefined) {
      try {
        handle = await this.ctx.agents.resume({
          resumeSessionId: sessionId,
          agentOptions,
        })
      } catch (error) {
        const persisted = await persistence.list()
        if (persisted.some(header => String(header.id) === sessionId)) {
          throw error
        }
      }
    }

    handle ??= await this.ctx.agents.create({
      sessionId,
      meta: { cwd: this.cwd },
      agentOptions,
    })
    const record = { handle }
    this.sessions.set(sessionId, record)
    return record
  }
}

export function apply(ctx, config = {}) {
  const transport = new JsonRpcLineTransport(process.stdin, process.stdout)
  const server = new CoffeeNoteJsonRpcServer(ctx, transport, {
    maxTokensAsSuccess: config.maxTokensAsSuccess === true,
  })
  const rootFiber = ctx.root.fiber
  let exitTask

  const disposeAndExit = () => {
    exitTask ??= (async () => {
      await Promise.allSettled([Promise.resolve().then(() => transport.flush())])
      await Promise.allSettled([Promise.resolve().then(() => rootFiber.dispose())])
      process.exit(0)
    })()
    return exitTask
  }

  transport.onRequest(async (method, params) => {
    const result = await server.handleRequest(method, params)
    if (method === 'shutdown') setImmediate(disposeAndExit)
    return result
  })
  ctx.effect(() => {
    transport.start()
    return async () => {
      await server.shutdown()
      transport.close()
    }
  }, 'coffee-jsonrpc.serve')
}
