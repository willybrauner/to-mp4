import chalk from 'chalk'

export const log = {
  error: (...rest: unknown[]) => console.log(chalk.bold.red(...(rest as [string]))),
  info: (...rest: unknown[]) => console.log(chalk.gray(...(rest as [string]))),
  success: (...rest: unknown[]) => console.log(chalk.cyan(...(rest as [string]))),
  warning: (...rest: unknown[]) => console.log(chalk.hex('#FFA500')(...(rest as [string]))),
  // Log a single "label: value" property, instead of dumping a whole object at once
  field: (label: string, value: unknown) =>
    console.log(chalk.gray(`  ${label.padEnd(14)}`), chalk.white(String(value))),
}
