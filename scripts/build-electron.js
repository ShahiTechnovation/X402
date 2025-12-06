import { build } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..')

async function buildElectron() {
  try {
    await build({
      build: {
        lib: {
          entry: path.join(projectRoot, 'src/main.ts'),
          name: 'main',
          fileName: () => 'electron/main.js',
          formats: ['es'],
        },
        outDir: path.join(projectRoot, 'dist'),
        rollupOptions: {
          external: ['electron', 'child_process', 'fs', 'path'],
        },
      },
    })
    console.log('✓ Electron main process built successfully')
  } catch (error) {
    console.error('✗ Failed to build electron:', error)
    process.exit(1)
  }
}

buildElectron()
