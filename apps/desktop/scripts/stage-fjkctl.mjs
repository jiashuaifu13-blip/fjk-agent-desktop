import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const src = 'D:/pet-desp/apps/desktop/src-tauri/target/release/fjkctl.exe'
const dst = 'D:/pet-desp/apps/desktop/src-tauri/resources/fjkctl.exe'

if (!existsSync(src)) {
  console.error('fjkctl.exe 尚未构建：先运行 cargo build --release --bin fjkctl')
  process.exit(1)
}

mkdirSync(dirname(dst), { recursive: true })
copyFileSync(src, dst)
console.log('staged fjkctl.exe ->', dst)
