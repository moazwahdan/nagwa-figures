import type { Lang, SceneData, ShapeInstance } from './types';

/** Figure text is a paper size (11.25pt by default), the same on every shape and language. */
export function labelSize(data: SceneData, _shape?: ShapeInstance, _lang?: Lang): number {
  return data.style.fontSize;
}
