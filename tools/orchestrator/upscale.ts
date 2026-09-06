import fs from 'fs/promises'
import path from 'path'
import { listFilesRecursive } from '@tsukiweb/common/tools/utils/fs-utils.ts'
import { resolveExecutable, runCommand } from '@tsukiweb/common/tools/utils/process-utils.ts'
import { logger } from '@tsukiweb/common/tools/utils/logger.ts'
import type { ExternalToolConfig } from './external-tools.ts'

const CAFFE_ARGS = ['-m', 'noise_scale', '-n', '0', '-s', '2', '-b', '8', '-p', 'cudnn']

export async function upscaleImageTree(
  config: ExternalToolConfig,
  toolsDir: string,
  inputDir: string,
  outputDir: string,
  execute: typeof runCommand = runCommand,
): Promise<void> {
  const executable = await resolveExecutable(config.WAIFU2X, toolsDir)
  if (!executable.found) throw new Error(`${config.WAIFU2X} is unavailable`)
  const modelDir = config.WAIFU2X_MODEL_DIR
    ? path.resolve(toolsDir, config.WAIFU2X_MODEL_DIR)
    : path.join(path.dirname(await fs.realpath(executable.command)), 'models-cunet')

  if (config.WAIFU2X_BACKEND === 'caffe') {
    await execute(executable.command, [
      '-i', inputDir, '-o', outputDir, ...CAFFE_ARGS, '-model_dir', modelDir,
    ], { cwd: executable.cwd, stdout: 'ignore' })
    logger.done()
    return
  }

  // ncnn processes flat directories only. Stage numbered files in one batch to
  // preserve nested paths and avoid reloading the GPU/model for every image.
  const files = (await listFilesRecursive(inputDir)).filter(file => /\.(png|jpe?g|webp)$/i.test(file))
  if (!files.length) throw new Error(`No images found in ${inputDir}`)
  const outputs = files.map(file => path.join(path.dirname(file), `${path.parse(file).name}.png`))
  if (new Set(outputs.map(file => file.toLowerCase())).size !== outputs.length) {
    throw new Error('Multiple source images would produce the same upscaled PNG filename.')
  }
  await fs.mkdir(path.dirname(outputDir), { recursive: true })
  const staging = await fs.mkdtemp(path.join(path.dirname(outputDir), '.waifu2x-'))
  try {
    const input = path.join(staging, 'input')
    const output = path.join(staging, 'output')
    await fs.mkdir(input)
    await fs.mkdir(output)
    for (let i = 0; i < files.length; i++) {
      await fs.copyFile(path.join(inputDir, files[i]), path.join(input, `${i}${path.extname(files[i]).toLowerCase()}`))
    }
    logger.progress(`Upscaling ${files.length} images with waifu2x-ncnn-vulkan`)
    await execute(executable.command, [
      '-i', input, '-o', output, '-n', '0', '-s', '2', '-m', modelDir, '-f', 'png',
    ], { cwd: executable.cwd, stdout: 'ignore' })
    // ncnn may report an image failure but still exit successfully. Check every
    // output before publishing; PNG also retains transparent sprite channels.
    for (let i = 0; i < files.length; i++) {
      const result = await fs.stat(path.join(output, `${i}.png`)).catch(() => null)
      if (!result?.isFile() || result.size === 0) {
        throw new Error(`waifu2x did not produce an output for ${files[i]}`)
      }
    }
    for (let i = 0; i < files.length; i++) {
      const destination = path.join(outputDir, outputs[i])
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.copyFile(path.join(output, `${i}.png`), destination)
    }
    logger.done()
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
}
