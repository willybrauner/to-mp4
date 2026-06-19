import { promisify } from 'util'
import { exec } from 'child_process'
import fs from 'fs'
import chalk from 'chalk'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'
import { glob } from 'glob'

const execPromise = promisify(exec)
const renamePromise = promisify(fs.rename)
const argv = yargs(hideBin(process.argv)).argv as any

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
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${inputFile}"`,
    )
    const [originalWidth, originalHeight] = stdout.trim().split(',').map(Number)
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

/**
 * Convert video to a specific width
 */
const mp4convertor = async ({
  width = argv.width || argv.w,
  crf = argv.crf || 23,
  bitrate = argv.bitrate || '2M',
  inputFile = argv._[0] ? argv._[0] : process.cwd(),
  outputFile = argv.output || argv.o,
  mute = argv.mute || false,
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
    const filename = isOverwrite
      ? `${filenameWithoutExt}.mp4`
      : `${filenameWithoutExt}-${width}x${height}.mp4`
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

  console.log('args', {
    width,
    height,
    crf,
    bitrate,
    inputFile,
    outputFile,
    isOverwrite,
    mute,
  })

  try {
    const sourceFile = isOverwrite
      ? inputFile.replace(
          path.basename(inputFile),
          `${path.basename(inputFile, path.extname(inputFile))}-original${path.extname(inputFile)}`,
        )
      : inputFile

    const audioOptions = mute ? '-an' : '-c:a aac -b:a 192k'

    await execPromise(
      `ffmpeg -y -i "${sourceFile}" -vf "scale=${width}:${height}:flags=lanczos" -c:v libx264 -crf ${crf} -preset slow -b:v ${bitrate} -pix_fmt yuv420p ${audioOptions} -threads 2 "${outputFile}"`,
    )
    console.log(chalk.green(`Video has been created: ${outputFile}`))
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
