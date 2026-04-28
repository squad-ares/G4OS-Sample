import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge condicional de classes CSS com Tailwind-aware conflict resolution.
 *
 * - `clsx` resolve inputs condicionais (objetos, arrays, falsy) em string
 *   plana de classes.
 * - `twMerge` deduplica classes Tailwind conflitantes — `cn('px-2', 'px-4')`
 *   retorna `'px-4'` (último ganha), não ambos com classe duplicada.
 *
 * Padrão recomendado para todos os componentes que aceitam `className` —
 * permite caller override sem quebrar utility classes do componente.
 *
 * @example
 * cn('px-2', condition && 'bg-red-500', 'px-4');
 * // → 'bg-red-500 px-4' (px-2 absorvido pelo px-4)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
