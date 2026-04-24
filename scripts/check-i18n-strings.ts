import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import ts from 'typescript';

const repoRoot = path.resolve(dirname(fileURLToPath(import.meta.url)), '..');
const monitoredRoots = [
  'apps/desktop/src/renderer',
  'packages/features/src',
  'packages/ui/src',
] as const;
const attributeNames = new Set(['aria-label', 'placeholder', 'title', 'alt']);
const ignoredPathFragments = [
  '/__tests__/',
  '/locales/',
  '/translate-provider.tsx',
  '/routeTree.gen.ts',
  '/platform/',
  '/node_modules/',
] as const;

const findings: string[] = [];

for (const root of monitoredRoots) {
  const files = globSync(`${root}/**/*.{ts,tsx}`, { cwd: repoRoot, absolute: true });

  for (const file of files) {
    if (ignoredPathFragments.some((fragment) => file.includes(fragment))) continue;

    const sourceText = readFileSync(file, 'utf-8');
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    inspectNode(sourceFile, sourceFile);
  }
}

if (findings.length > 0) {
  console.error('Strings hardcoded de interface encontradas nos caminhos monitorados:\n');
  for (const finding of findings) {
    console.error(finding);
  }
  process.exitCode = 1;
}

function inspectNode(node: ts.Node, sourceFile: ts.SourceFile): void {
  if (ts.isJsxText(node) && containsUserFacingText(node.getText(sourceFile))) {
    pushFinding(sourceFile, node, 'Texto JSX precisa passar pelo sistema de tradução.');
  }

  if (
    ts.isJsxAttribute(node) &&
    ts.isIdentifier(node.name) &&
    attributeNames.has(node.name.text) &&
    node.initializer &&
    ts.isStringLiteral(node.initializer) &&
    containsUserFacingText(node.initializer.text)
  ) {
    pushFinding(
      sourceFile,
      node.initializer,
      `Atributo "${node.name.text}" precisa usar conteúdo traduzido.`,
    );
  }

  node.forEachChild((child) => {
    inspectNode(child, sourceFile);
  });
}

function containsUserFacingText(input: string): boolean {
  const normalized = input.replace(/\s+/gu, ' ').trim();
  if (normalized.length === 0) return false;
  if (/^[\d\s.,:;!?()[\]/-]+$/u.test(normalized)) return false;
  return /[A-Za-zÀ-ÿ]/u.test(normalized);
}

function pushFinding(sourceFile: ts.SourceFile, node: ts.Node, message: string): void {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const relativePath = path.relative(repoRoot, sourceFile.fileName);
  findings.push(`${relativePath}:${line + 1}:${character + 1}  ${message}`);
}
