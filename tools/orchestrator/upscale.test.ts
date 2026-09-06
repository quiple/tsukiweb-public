import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import { externalToolConfig } from './external-tools.ts'
import { upscaleImageTree } from './upscale.ts'

test('platform defaults and legacy/custom executable overrides', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    const config = externalToolConfig({}, platform)
    assert.equal(config.FFMPEG, 'ffmpeg')
    assert.equal(config.WAIFU2X, 'waifu2x-ncnn-vulkan')
    assert.equal(config.WAIFU2X_BACKEND, 'ncnn')
  }
  assert.equal(externalToolConfig({}, 'win32').FFMPEG, 'ffmpeg.exe')
  assert.equal(externalToolConfig({}, 'win32').WAIFU2X_BACKEND, 'caffe')
  const legacy = externalToolConfig({ WAIFU2X_CAFFE: 'C:/custom/caffe.exe', FFMPEG: 'custom-ffmpeg' }, 'win32')
  assert.equal(legacy.WAIFU2X, 'C:/custom/caffe.exe')
  assert.equal(legacy.FFMPEG, 'custom-ffmpeg')
  const custom = externalToolConfig({ WAIFU2X: '/custom/ncnn', WAIFU2X_BACKEND: 'ncnn' }, 'win32')
  assert.equal(custom.WAIFU2X, '/custom/ncnn')
  assert.equal(custom.WAIFU2X_BACKEND, 'ncnn')
})

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tsuki assets '))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const executable = path.join(root, 'waifu2x')
  await fs.writeFile(executable, '')
  const input = path.join(root, 'img')
  const output = path.join(root, 'img_x2')
  for (const file of ['bg/scene.jpg', 'tachi/scene.png', 'event/nested/special.webp']) {
    await fs.mkdir(path.dirname(path.join(input, file)), { recursive: true })
    await fs.writeFile(path.join(input, file), file)
  }
  await fs.writeFile(path.join(input, '.DS_Store'), 'ignored')
  return { root, input, output, config: externalToolConfig({ WAIFU2X: executable }, 'darwin') }
}

test('ncnn batches nested images, preserves names, filters metadata, and uses PNG', async t => {
  const { root, input, output, config } = await fixture(t)
  let calls = 0
  await upscaleImageTree(config, root, input, output, async (_command, args, options) => {
    calls++
    const arg = (key: string) => args[args.indexOf(key) + 1]
    assert.equal(arg('-s'), '2')
    assert.equal(arg('-n'), '0')
    assert.equal(arg('-f'), 'png')
    assert.equal(arg('-m'), path.join(await fs.realpath(root), 'models-cunet'))
    assert.equal(options?.cwd, root)
    assert.ok(!args.includes('cudnn'))
    const staged = await fs.readdir(arg('-i'))
    assert.equal(staged.length, 3)
    for (const file of staged) {
      await fs.copyFile(path.join(arg('-i'), file), path.join(arg('-o'), `${path.parse(file).name}.png`))
    }
  })
  assert.equal(calls, 1)
  for (const [dest, original] of [
    ['bg/scene.png', 'bg/scene.jpg'],
    ['tachi/scene.png', 'tachi/scene.png'],
    ['event/nested/special.png', 'event/nested/special.webp'],
  ]) assert.equal(await fs.readFile(path.join(output, dest), 'utf8'), original)
  assert.ok(!(await fs.readdir(root)).some(file => file.startsWith('.waifu2x-')))
})

test('missing outputs fail without publishing and temporary files are cleaned up', async t => {
  const { root, input, output, config } = await fixture(t)
  await assert.rejects(upscaleImageTree(config, root, input, output, async () => {}), /did not produce/)
  await assert.rejects(fs.stat(output), { code: 'ENOENT' })
  assert.ok(!(await fs.readdir(root)).some(file => file.startsWith('.waifu2x-')))
})

test('command failures clean staging and duplicate stems fail before executing', async t => {
  const { root, input, output, config } = await fixture(t)
  await assert.rejects(upscaleImageTree(config, root, input, output, async () => {
    throw new Error('GPU failure')
  }), /GPU failure/)
  assert.ok(!(await fs.readdir(root)).some(file => file.startsWith('.waifu2x-')))
  await fs.writeFile(path.join(input, 'bg/scene.png'), 'duplicate')
  await assert.rejects(upscaleImageTree(config, root, input, output, async () => {
    assert.fail('must not execute')
  }), /same upscaled PNG/)
})

test('Caffe keeps its Windows arguments and supports a custom model directory', async t => {
  const { root, input, output, config } = await fixture(t)
  await upscaleImageTree({ ...config, WAIFU2X_BACKEND: 'caffe', WAIFU2X_MODEL_DIR: 'custom models' }, root, input, output, async (_command, args) => {
    assert.deepEqual(args, [
      '-i', input, '-o', output, '-m', 'noise_scale', '-n', '0', '-s', '2',
      '-b', '8', '-p', 'cudnn', '-model_dir', path.join(root, 'custom models'),
    ])
  })
})
