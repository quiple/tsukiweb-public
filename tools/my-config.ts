// Commands are searched beside this file, then in PATH.
// Relative paths are resolved from the tools/ directory.
export default {
  // Defaults: Windows uses waifu2x-caffe-cui.exe and ffmpeg.exe;
  // macOS/Linux use waifu2x-ncnn-vulkan and ffmpeg.
  // To use a downloaded macOS package, keep its models beside the binary:
  // WAIFU2X: './waifu2x-ncnn-vulkan/waifu2x-ncnn-vulkan',
  // WAIFU2X_BACKEND: 'ncnn',
  // FFMPEG: '/opt/homebrew/bin/ffmpeg',
  PUBLIC: '../public',
}
