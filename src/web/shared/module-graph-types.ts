export type ModuleArchitectureLayer =
  | 'presentation'
  | 'business'
  | 'data'
  | 'infrastructure'
  | 'unknown';

export interface ModuleGraphNode {
  id: string;
  name: string;
  path: string;
  type: 'frontend' | 'backend' | 'database' | 'service' | 'infrastructure' | 'other';
  architectureLayer: ModuleArchitectureLayer;
}

export interface ModuleGraphEdge {
  source: string;
  target: string;
  type: 'import';
  strength: number;
}

export interface ModuleGraphData {
  nodes: ModuleGraphNode[];
  edges: ModuleGraphEdge[];
}
