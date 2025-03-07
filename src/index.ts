import { promisify } from 'util'
import { exec } from 'child_process'
const execPromise = promisify(exec)
import chalk from 'chalk'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'
const argv = yargs(hideBin(process.argv)).argv

const _getVideoHeight = async (
  inputFile: string,
  width: number,
): Promise<number | null> => {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v error -select_streams v:0 -show_entries stream=height,width -of csv=s=x:p=0 "${inputFile}"`,
    )
    const [originalWidth, originalHeight] = stdout.trim().split('x').map(Number)
    return Math.round((originalHeight / originalWidth) * width)
  } catch (error) {
    console.error(`Error getting video height: ${error}`)
    return null
  }
}

/**
 * Convert video to a specific width
 */
const mp4convertor = async ({
  width = argv.width || argv.w || 1280,
  crf = argv.crf || 25,
  bitrate = argv.bitrate || '400K',
  inputFile = argv._[0] ? argv._[0] : process.cwd(),
  outputFile = argv.output || argv.o,
} = {}) => {
  const height = await _getVideoHeight(inputFile, width)

  console.log('args', {
    width,
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
      `ffmpeg -y -i "${inputFile}" -vf "scale=${width}:-2" -c:v libx264 -crf ${crf} -preset ultrafast -b:v ${bitrate} -threads 2 -an "${outputFile}"`,
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
