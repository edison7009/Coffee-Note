import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import * as tar from 'tar'

const root = path.resolve('dsh-runtime')
const modules = path.join(root, 'node_modules')
const output = path.join(root, 'coffee-note-dsh-runtime.tar.gz')

await stat(path.join(modules, '@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/packaged-bin.js'))
  .catch(() => {
    throw new Error('DeepSeek Harness is not installed. Run npm run dsh:ci first.')
  })
await mkdir(root, { recursive: true })
await tar.c({
  cwd: root,
  file: output,
  gzip: true,
  portable: true,
  noMtime: true,
  filter: entry => !entry.replaceAll('\\', '/').startsWith('node_modules/.bin/'),
}, ['coffee-note.cordis.yml', 'src', 'node_modules'])

process.stdout.write(`Packed ${path.relative(process.cwd(), output)}\n`)
