export type GraphLayoutMode = "dagre" | "cose";

export type CyGraphApi = {
  fit: (padding?: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};
