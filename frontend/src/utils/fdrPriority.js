import { calculateFdrPriority } from "../../../shared/fdrPriority.mjs";

export function getFdrPriority(fdr) {
  return fdr?.priority || calculateFdrPriority(fdr);
}
