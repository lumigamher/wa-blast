// Límites de la base documental por org. v1 = constantes planas.
// (Subibles por plan luego: mover a un mapa PlanId → límites.)
export const RAG_LIMITS = {
  maxDocsPerOrg: 20,
  maxBytesPerDoc: 2 * 1024 * 1024, // 2 MB
  maxChunksPerOrg: 1500,
} as const;
