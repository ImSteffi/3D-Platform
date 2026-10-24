import { build } from 'vite'
import { mkdir, copyFile, readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontend = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(frontend, 'viewer-dist')
await build({
 configFile: false,
 root: path.join(frontend, 'viewer-export'),
 base: './',
 build: {
  outDir: output,
  emptyOutDir: true,
  chunkSizeWarningLimit: 3000,
  rollupOptions: { output: { entryFileNames: 'index.js', chunkFileNames: 'assets/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' } },
 },
})
await copyFile(path.join(frontend, 'viewer-export/theme.css'), path.join(output, 'theme.css'))
const document = await readFile(path.join(output, 'index.html'), 'utf8')
await writeFile(path.join(output, 'index.html'), document.replace('</head>', '<link rel="stylesheet" href="./theme.css">\n</head>'))
await mkdir(path.join(output, 'licenses'), { recursive: true })
const pkg = path.join(frontend, 'node_modules/@playcanvas/supersplat-viewer')
await copyFile(path.join(pkg, 'LICENSE'), path.join(output, 'licenses/supersplat-viewer-LICENSE.txt'))
await copyFile(path.join(pkg, 'THIRD_PARTY_NOTICES.md'), path.join(output, 'licenses/THIRD_PARTY_NOTICES.md'))
await copyFile(path.join(frontend, 'node_modules/playcanvas/LICENSE'), path.join(output, 'licenses/playcanvas-LICENSE.txt'))
const version = JSON.parse(await readFile(path.join(pkg, 'package.json'), 'utf8')).version
await writeFile(path.join(output, 'VERSION.txt'), 'SuperSplat Viewer ' + version + '\n')
const entries = await readdir(output, { recursive: true, withFileTypes: true })
const files = entries.filter(entry => entry.isFile()).map(entry => path.relative(output, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, '/')).filter(name => !/(?:^|[/:\uF03A\uFF1A])zone\.identifier(?::\$data)?$/i.test(name)).sort()
await writeFile(path.join(output, 'bundle-files.json'), JSON.stringify(files, null, 2))
