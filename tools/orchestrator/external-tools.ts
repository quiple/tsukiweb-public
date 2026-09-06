export interface ExternalToolConfig {
  WAIFU2X: string
  WAIFU2X_BACKEND: 'caffe' | 'ncnn'
  // Relative to tools/. Defaults to models-cunet beside the executable.
  WAIFU2X_MODEL_DIR?: string
  FFMPEG: string
}

export type ExternalToolOverrides = Partial<ExternalToolConfig> & {
  /** Legacy Windows configuration. Prefer WAIFU2X for new configurations. */
  WAIFU2X_CAFFE?: string
}

export function externalToolConfig(
  overrides: ExternalToolOverrides = {},
  platform: NodeJS.Platform = process.platform,
): ExternalToolConfig {
  const backend = overrides.WAIFU2X_BACKEND
    ?? (overrides.WAIFU2X_CAFFE ? 'caffe' : platform === 'win32' ? 'caffe' : 'ncnn')
  if (backend !== 'caffe' && backend !== 'ncnn') {
    throw new Error('WAIFU2X_BACKEND must be "caffe" or "ncnn".')
  }
  return {
    WAIFU2X: overrides.WAIFU2X ?? overrides.WAIFU2X_CAFFE
      ?? (backend === 'caffe' ? 'waifu2x-caffe-cui.exe'
        : `waifu2x-ncnn-vulkan${platform === 'win32' ? '.exe' : ''}`),
    WAIFU2X_BACKEND: backend,
    WAIFU2X_MODEL_DIR: overrides.WAIFU2X_MODEL_DIR,
    FFMPEG: overrides.FFMPEG ?? (platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
  }
}

export function waifu2xDownloadUrl(config: ExternalToolConfig): string {
  return config.WAIFU2X_BACKEND === 'caffe'
    ? 'https://github.com/lltcggie/waifu2x-caffe/releases'
    : 'https://github.com/nihui/waifu2x-ncnn-vulkan/releases'
}
