import { promisify } from 'util'
import { exec } from 'child_process'
const execPromise = promisify(exec)
import chalk from 'chalk'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'

const argv = yargs(hideBin(process.argv)).argv

const _getVideoDimensions = async (inputFile) => {
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

/**
 * Convert video to a specific width
 */
const mp4convertor = async ({
  width = argv.width || argv.w,
  crf = argv.crf || 23,
  bitrate = argv.bitrate || '1M',
  inputFile = argv._[0] ? argv._[0] : process.cwd(),
  outputFile = argv.output || argv.o,
} = {}) => {
  const dimensions = await _getVideoDimensions(inputFile)
  if (!dimensions) return
  const { originalWidth, originalHeight } = dimensions
  if (!width) width = originalWidth
  const height = Math.round((originalHeight / originalWidth) * width)

  console.log('args', {
    width,
    height,
    crf,
    bitrate,
    inputFile,
    outputFile,
  })

  if (!outputFile) {
    const filenameWithoutExt = path.basename(inputFile, path.extname(inputFile))
    const filename = `${filenameWithoutExt}-${width}x${height}.mp4`
    const outputDir = path.dirname(inputFile)
    outputFile = path.join(outputDir, filename)
  }

  try {
    await execPromise(
      `ffmpeg -y -i "${inputFile}" -vf "scale=${width}:${height}:flags=lanczos" -c:v libx264 -crf ${crf} -preset slow -b:v ${bitrate} -pix_fmt yuv420p -threads 2 -an "${outputFile}"`,
    )
    console.log(chalk.green(`Video has been created: ${outputFile}`))
  } catch (error) {
    console.error(`Error converting video: ${error}`)
  }
}

/**
 * Start conversion for one file
 */
;(async () => {
  mp4convertor()
})()
