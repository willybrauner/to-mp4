import { promisify } from 'util'
import { exec } from 'child_process'
import fs from 'fs'
import chalk from 'chalk'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'
import { glob } from 'glob'
import ora from 'ora'
import { log } from './log'

const execPromise = promisify(exec)
const renamePromise = promisify(fs.rename)
const argv = yargs(hideBin(process.argv))
  .scriptName('tomp4')
  .usage('$0 [input] [options]\n\nConvert a video file, a directory or a glob pattern to MP4.')
  .positional('input', {
    describe: 'Video file, directory or glob pattern (default: current directory)',
  })
  .option('width', { alias: 'w', describe: 'Output width in px, height keeps the aspect ratio (default: source width)' })
  .option('crf', { describe: 'Constant Rate Factor, lower is better quality (default: 23)' })
  .option('bitrate', { describe: "Cap the video bitrate, e.g. '400K' (default: no cap)" })
  .option('fps', { describe: 'Output frame rate (default: source frame rate)' })
  .option('speed', { alias: 's', describe: 'Playback speed multiplier, e.g. 2 or 0.5 (default: 1)' })
  .option('mute', { describe: 'Remove the audio track (default: false)' })
  .option('output', {
    alias: 'o',
    describe: 'Output file path (default: {name}-{width}x{height}.mp4 next to the input). Note: also enables overwrite mode',
  })
  .option('overwrite', {
    describe: 'Write {name}.mp4 and rename the original file to {name}-original.{ext}',
  })
  .example('$0 video.mov --width 1280 --crf 25', 'Resize and compress a video')
  .example('$0 video.mov --speed 2 --mute', 'Speed up 2x without audio')
  .example('$0 ./videos', 'Convert every video of a directory')
  .example("$0 './videos/*.mov'", 'Convert files matching a glob pattern')
  .help('help')
  .alias('help', 'h')
  .version(false)
  .wrap(Math.min(100, process.stdout.columns || 100)).argv as any

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv', '.mts', '.m2ts']

const _resolveInputFiles = async (input: string): Promise<string[]> => {
  // Directory → all video files inside
  if (fs.existsSync(input) && fs.statSync(input).isDirectory()) {
    const files = fs.readdirSync(input)
      .filter(f => VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .map(f => path.join(input, f))
    return files
  }
  // Glob pattern
  if (input.includes('*') || input.includes('?') || input.includes('{')) {
    return glob(input)
  }
  // Single file
  return [input]
}

const _getVideoDimensions = async (inputFile: any) => {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v error -select_streams v:0 -show_streams -of json "${inputFile}"`,
    )
    const data = JSON.parse(stdout)
    const stream = data.streams[0]
    let originalWidth: number = stream.width
    let originalHeight: number = stream.height
    // tags.rotate = older format (MOV/MP4 atoms), side_data_list = newer Display Matrix format
    const tagRotate = parseInt(stream.tags?.rotate ?? '0', 10)
    const sideDataRotation = stream.side_data_list?.find((d: any) => 'rotation' in d)?.rotation ?? 0
    const rotate = tagRotate || sideDataRotation
    // ffmpeg auto-rotates by default, so swap dimensions to match display orientation
    if (Math.abs(rotate) === 90 || Math.abs(rotate) === 270) {
      ;[originalWidth, originalHeight] = [originalHeight, originalWidth]
    }
    return { originalWidth, originalHeight }
  } catch (error) {
    console.error(`Error getting video dimensions: ${error}`)
    return null
  }
}

const _roundToEven = (num: number): number => {
  const rounded = Math.round(num)
  return rounded % 2 === 0 ? rounded : rounded + 1
}

const _buildAtempoChain = (speed: number): string => {
  const filters: string[] = []
  let remaining = speed
  while (remaining > 2.0) {
    filters.push('atempo=2.0')
    remaining /= 2.0
  }
  while (remaining < 0.5) {
    filters.push('atempo=0.5')
    remaining /= 0.5
  }
  filters.push(`atempo=${remaining}`)
  return filters.join(',')
}

/**
 * Convert video to a specific width
 */
const mp4convertor = async ({
  width = argv.width || argv.w,
  crf = argv.crf || 23,
  // no cap by default: crf alone sets the quality, a cap smears soft gradients
  bitrate = argv.bitrate,
  fps = argv.fps,
  inputFile = argv._[0] ? argv._[0] : process.cwd(),
  outputFile = argv.output || argv.o,
  mute = argv.mute || false,
  speed = argv.speed || argv.s || 1,
} = {}) => {
  const dimensions = await _getVideoDimensions(inputFile)
  if (!dimensions) return
  const { originalWidth, originalHeight } = dimensions
  if (!width) width = originalWidth

  // Ensure width is even
  width = _roundToEven(width)

  const height = _roundToEven((originalHeight / originalWidth) * width)

  const isOverwrite = argv.o || argv.overwrite

  if (!outputFile || typeof outputFile === 'boolean') {
    const filenameWithoutExt = path.basename(inputFile, path.extname(inputFile))
    const speedSuffix = speed !== 1 ? `-${speed}x` : ''
    const filename = isOverwrite
      ? `${filenameWithoutExt}.mp4`
      : `${filenameWithoutExt}-${width}x${height}${speedSuffix}.mp4`
    const outputDir = path.dirname(inputFile)
    outputFile = path.join(outputDir, filename)
  }

  // If overwrite mode, rename original file with -original suffix
  if (isOverwrite) {
    const originalFileExt = path.extname(inputFile)
    const originalFileWithoutExt = path.basename(inputFile, originalFileExt)
    const originalFileDir = path.dirname(inputFile)
    const backupFile = path.join(
      originalFileDir,
      `${originalFileWithoutExt}-original${originalFileExt}`,
    )

    try {
      await renamePromise(inputFile, backupFile)
      console.log(`Original file renamed to: ${backupFile}`)
    } catch (error) {
      console.error(`Error renaming original file: ${error}`)
      return
    }
  }

  console.log(chalk.cyan(`\n${path.basename(inputFile)}`))
  log.field('width', width)
  log.field('height', height)
  log.field('crf', crf)
  log.field('bitrate', bitrate ?? 'none')
  log.field('fps', fps ?? 'source')
  log.field('output', outputFile)
  log.field('overwrite', isOverwrite)
  log.field('mute', mute)
  log.field('speed', speed)

  try {
    const sourceFile = isOverwrite
      ? inputFile.replace(
          path.basename(inputFile),
          `${path.basename(inputFile, path.extname(inputFile))}-original${path.extname(inputFile)}`,
        )
      : inputFile

    const ptsFilter = speed !== 1 ? `,setpts=${1 / speed}*PTS` : ''
    const vf = `scale=${width}:${height}:flags=lanczos${ptsFilter}`

    const bitrateOption = bitrate ? `-b:v ${bitrate}` : ''
    const fpsOption = fps ? `-r ${fps}` : ''

    let audioOptions: string
    if (mute) {
      audioOptions = '-an'
    } else if (speed !== 1) {
      audioOptions = `-c:a aac -b:a 192k -af "${_buildAtempoChain(speed)}"`
    } else {
      audioOptions = '-c:a aac -b:a 192k'
    }

    const spinner = ora('Converting…').start()
    try {
      await execPromise(
        `ffmpeg -y -i "${sourceFile}" -vf "${vf}" -c:v libx264 -crf ${crf} -preset slow ${bitrateOption} ${fpsOption} -pix_fmt yuv420p ${audioOptions} -threads 2 "${outputFile}"`,
      )
    } finally {
      spinner.stop()
    }

    const originalSize = fs.statSync(sourceFile).size / 1000
    const newSize = fs.statSync(outputFile).size / 1000
    const diff = newSize - originalSize
    const isDecreased = diff < 0
    const isEqual = diff === 0
    const diffSymbol = isDecreased ? '↓' : isEqual ? '=' : '↑'
    const diffColor = isDecreased ? 'green' : isEqual ? 'yellow' : 'red'
    const diffPercent = originalSize === 0 ? 0 : (diff / originalSize) * 100

    console.log(chalk.gray(`\n  ${originalSize.toFixed(2)} KB`))
    console.log(
      `  ${newSize.toFixed(2)} KB `,
      chalk[diffColor](`${diffSymbol} ${diff.toFixed(2)} KB (${diffPercent.toFixed(1)}%)`),
    )
    console.log(chalk.green(`✓ Video has been created: ${outputFile}\n`))
  } catch (error) {
    console.error(`Error converting video: ${error}`)
  }
}

/**
 * Start conversion — single file, directory, or glob
 */
;(async () => {
  const rawInput = argv._[0] ? String(argv._[0]) : process.cwd()
  const files = await _resolveInputFiles(rawInput)

  if (files.length === 0) {
    console.log(chalk.yellow('No video files found.'))
    return
  }

  if (files.length > 1) {
    console.log(chalk.blue(`Converting ${files.length} files…`))
  }

  for (const file of files) {
    await mp4convertor({ inputFile: file })
  }
})()
