/**
 * Turns a newer copy of a source file into the document the drift check compares against (E5): the same importer
 * that made the diagram, picked by what the file looks like or named outright. Throws a plain Error when the text is
 * not a file one of them reads.
 */
import type { DiagramDocument } from '../types';
import { looksLikeAsyncApi, looksLikeCompose, looksLikeKubernetes, looksLikeOpenApi } from './sniff';
import { COMPOSE_SOURCE, convertCompose } from './compose';
import { KUBERNETES_SOURCE, convertKubernetes } from './kubernetes';
import { OPENAPI_SOURCE, convertOpenApi } from './openapi';
import { ASYNCAPI_SOURCE, convertAsyncApi } from './asyncapi';

export interface DriftSource {
  kind: string;
  doc: DiagramDocument;
}

const READERS: Array<{ kind: string; matches: (name: string, text: string) => boolean; convert: (text: string, title: string) => { doc: DiagramDocument } }> = [
  { kind: OPENAPI_SOURCE, matches: looksLikeOpenApi, convert: convertOpenApi },
  { kind: ASYNCAPI_SOURCE, matches: looksLikeAsyncApi, convert: convertAsyncApi },
  { kind: KUBERNETES_SOURCE, matches: looksLikeKubernetes, convert: convertKubernetes },
  { kind: COMPOSE_SOURCE, matches: looksLikeCompose, convert: convertCompose },
];

/** Convert `text`. With `kind` that importer reads it whatever it looks like; without, the file's own look decides. */
export function convertForDrift(fileName: string, text: string, kind?: string): DriftSource {
  const reader = kind ? READERS.find((r) => r.kind === kind) : READERS.find((r) => r.matches(fileName, text));
  if (!reader) {
    throw new Error(kind ? `There is no drift check for "${kind}" files.` : `${fileName} is not a Docker Compose, Kubernetes, OpenAPI or AsyncAPI file.`);
  }
  return { kind: reader.kind, doc: reader.convert(text, 'Drift check').doc };
}
