// Map every SVG in src/diagrams to a URL keyed by its file name (= diagramId).
const modules = import.meta.glob("../diagrams/*.svg", { eager: true, query: "?url", import: "default" });

const DIAGRAMS: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  const name = path.split("/").pop()!.replace(/\.svg$/, "");
  DIAGRAMS[name] = url as string;
}

export function DiagramViewer({ diagramId, title }: { diagramId: string; title?: string }) {
  const src = DIAGRAMS[diagramId];
  if (!src) return <div className="diagram diagram-missing">No diagram</div>;
  return (
    <div className="diagram">
      <img src={src} alt={title ?? diagramId} />
    </div>
  );
}
