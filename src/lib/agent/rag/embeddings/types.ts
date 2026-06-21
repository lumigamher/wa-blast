export interface EmbeddingProvider {
  /** Identificador del modelo (para guardar en agent_documents.embed_model). */
  readonly model: string;
  /** Dimensión de los vectores. */
  readonly dims: number;
  /** Devuelve un embedding por cada texto, en el mismo orden. */
  embed(texts: string[]): Promise<number[][]>;
}
