import { register } from 'node:module';

const loaderCode = `
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes('?raw') && (specifier.startsWith('./') || specifier.startsWith('../'))) {
    const parentPath = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
    const file = resolvePath(parentPath, specifier.replace(/\\?raw$/, ''));
    const source = 'export default ' + JSON.stringify(readFileSync(file, 'utf8')) + ';';
    return {
      url: 'data:text/javascript;base64,' + Buffer.from(source).toString('base64'),
      shortCircuit: true,
    };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !specifier.endsWith('.ts') && !specifier.endsWith('.js') && !specifier.endsWith('.mjs')) {
    const parentPath = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
    const candidate = resolvePath(parentPath, specifier + '.ts');
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}
`;

register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`);
