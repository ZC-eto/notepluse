/**
 * 将 dist/ 内容打成 ZIP（文件在压缩包根目录，不要套一层 dist 文件夹）
 * ZTools 导入要求：zip 根路径必须能直接读到 plugin.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const releaseDir = path.join(root, 'release')

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

if (!fs.existsSync(path.join(dist, 'plugin.json'))) {
  fail('dist/plugin.json 不存在。请先执行 npm run build')
}
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  fail('dist/index.html 不存在。请先执行 npm run build')
}
if (!fs.existsSync(path.join(dist, 'preload', 'services.js'))) {
  fail('dist/preload/services.js 不存在')
}

const pluginJsonPath = path.join(dist, 'plugin.json')
const cfg = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'))
delete cfg.development
delete cfg.$schema
fs.writeFileSync(pluginJsonPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8')

const version = cfg.version || '0.0.0'
const name = cfg.name || 'plugin'
fs.mkdirSync(releaseDir, { recursive: true })
const zipName = `${name}-v${version}.zip`
const zipPath = path.join(releaseDir, zipName)
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)

const distEsc = dist.replace(/'/g, "''")
const zipEsc = zipPath.replace(/'/g, "''")

const packPs = [
  "$ErrorActionPreference='Stop'",
  `$src = Join-Path '${distEsc}' '*'`,
  `$dst = '${zipEsc}'`,
  'if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }',
  'Compress-Archive -Path $src -DestinationPath $dst -Force',
  'Write-Output $dst',
].join('; ')

execFileSync('powershell.exe', ['-NoProfile', '-Command', packPs], { stdio: 'inherit' })

const verifyPs = [
  'Add-Type -AssemblyName System.IO.Compression.FileSystem',
  `$z = [System.IO.Compression.ZipFile]::OpenRead('${zipEsc}')`,
  '$names = @($z.Entries | ForEach-Object { $_.FullName })',
  '$z.Dispose()',
  "if ($names -notcontains 'plugin.json') { throw ('ZIP 根目录缺少 plugin.json，当前: ' + ($names -join ', ')) }",
  "Write-Output ('ZIP_OK count=' + $names.Count)",
  "$names | Select-Object -First 30 | ForEach-Object { Write-Output (' - ' + $_) }",
].join('; ')

execFileSync('powershell.exe', ['-NoProfile', '-Command', verifyPs], { stdio: 'inherit' })

console.log('')
console.log('已生成安装包:')
console.log(zipPath)
console.log('')
console.log('ZTools 导入：设置 → 插件 → 导入本地插件 → 选择该 zip')