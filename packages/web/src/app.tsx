import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import * as d3 from "d3";

interface ImportedSymbol {
  name: string;
  originalName: string;
}

interface Import {
  specifier: string;
  kind: string;
  resolvedPath: string | null;
  isExternal: boolean;
  symbols: ImportedSymbol[];
}

interface Symbol {
  name: string;
  kind: string;
  signature: string;
  visibility: string;
  parent?: string;
}

interface FileNode {
  name: string;
  type: "file";
  extension: string | null;
  imports: Import[];
  symbols: Symbol[];
}

interface DirectoryNode {
  name: string;
  type: "directory";
  children: ASTNode[];
}

type ASTNode = FileNode | DirectoryNode;

interface RootNode {
  type: "root";
  absolutePath: string;
  tree: DirectoryNode;
  externals: string[];
}

interface TreeControls {
  clearSelection: () => void;
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<TreeControls | null>(null);
  const [rootPath, setRootPath] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);

  useEffect(() => {
    fetch("/api/tree")
      .then((res) => res.json())
      .then((data: RootNode) => {
        setRootPath(data.absolutePath);
        if (containerRef.current) {
          controlsRef.current = renderTree(
            containerRef.current,
            data,
            (filePath, fileNode) => {
              setSelected(filePath);
              setSelectedNode(fileNode);
            },
            () => {
              setSelected(null);
              setSelectedNode(null);
            }
          );
        }
      });
  }, []);

  function handleClose() {
    controlsRef.current?.clearSelection();
    setSelected(null);
    setSelectedNode(null);
  }

  return (
    <div>
      <header>
        <h1>grail</h1>
        {rootPath && <span>{rootPath}</span>}
      </header>
      <div class="main-layout">
        <div ref={containerRef} class="tree-container" />
        {selected && selectedNode && (
          <div class="sidebar">
            <div class="sidebar-header">
              <span class="sidebar-title">{selected.split("/").pop()}</span>
              <button class="sidebar-close" onClick={handleClose}>x</button>
            </div>
            <div class="sidebar-path">{selected.replace(rootPath + "/", "")}</div>
            {selectedNode.imports.length === 0 ? (
              <div class="sidebar-empty">No imports</div>
            ) : (
              <ul class="import-list">
                {selectedNode.imports.map((imp) => (
                  <li class={imp.isExternal ? "external" : "local"}>
                    <span class="import-kind">{imp.kind}</span>
                    <span class="import-specifier">{imp.specifier}</span>
                    {imp.isExternal && <span class="import-badge">ext</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function maxDepth(node: d3.HierarchyNode<ASTNode>): number {
  if (!node.children) return 0;
  return 1 + Math.max(...node.children.map(maxDepth));
}

function buildPathMap(
  node: ASTNode,
  currentPath: string,
  map: Map<string, ASTNode>
): void {
  if (node.type === "file") {
    map.set(currentPath, node);
    return;
  }
  for (const child of node.children) {
    buildPathMap(child, currentPath + "/" + child.name, map);
  }
}

function renderTree(
  container: HTMLElement,
  data: RootNode,
  onSelect: (filePath: string, node: FileNode) => void,
  onDeselect: () => void
): TreeControls {
  const root = d3.hierarchy(data.tree);
  const descendants = root.descendants();
  const nodeHeight = 26;
  const paddingTop = 40;
  const paddingBottom = 40;
  const paddingLeft = 120;
  const paddingRight = 160;
  const depthSpacing = 180;

  const depth = maxDepth(root);
  const height = descendants.length * nodeHeight + paddingTop + paddingBottom;
  const width = depth * depthSpacing + paddingLeft + paddingRight;

  const treeLayout = d3
    .tree<ASTNode>()
    .size([
      height - paddingTop - paddingBottom,
      width - paddingLeft - paddingRight,
    ]);

  const treeRoot = treeLayout(root);

  // Build path -> position and node maps
  const posMap = new Map<string, { x: number; y: number }>();
  const d3NodeMap = new Map<string, d3.HierarchyPointNode<ASTNode>>();

  function mapPositions(
    node: d3.HierarchyPointNode<ASTNode>,
    currentPath: string
  ) {
    if (node.data.type === "file") {
      posMap.set(currentPath, { x: node.x, y: node.y });
      d3NodeMap.set(currentPath, node);
    }
    if (node.children) {
      for (const child of node.children) {
        mapPositions(child, currentPath + "/" + child.data.name);
      }
    }
  }
  mapPositions(treeRoot, data.absolutePath);

  // Build file path -> FileNode map
  const fileNodeMap = new Map<string, FileNode>();
  const pathMap = new Map<string, ASTNode>();
  buildPathMap(data.tree, data.absolutePath, pathMap);
  for (const [p, n] of pathMap) {
    if (n.type === "file") fileNodeMap.set(p, n);
  }

  // Reverse map: d3 node object -> filePath
  const d3NodeToPath = new Map<d3.HierarchyPointNode<ASTNode>, string>();
  for (const [p, n] of d3NodeMap) {
    d3NodeToPath.set(n, p);
  }

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg
    .append("g")
    .attr("transform", `translate(${paddingLeft},${paddingTop})`);

  // Dependency edge layer (behind nodes)
  const depLayer = g.append("g").attr("class", "dep-edges");

  // Tree links
  const treeLinks = g
    .selectAll("path.tree-link")
    .data(treeRoot.links())
    .join("path")
    .attr("class", "tree-link")
    .attr("fill", "none")
    .attr("stroke", "#30363d")
    .attr("stroke-width", 1.5)
    .attr("d", (d: any) => {
      return `M${d.source.y},${d.source.x}
              C${(d.source.y + d.target.y) / 2},${d.source.x}
               ${(d.source.y + d.target.y) / 2},${d.target.x}
               ${d.target.y},${d.target.x}`;
    });

  // Nodes
  const nodeGroups = g
    .selectAll("g.node")
    .data(descendants)
    .join("g")
    .attr("class", "node")
    .attr("transform", (d: any) => `translate(${d.y},${d.x})`);

  nodeGroups
    .append("circle")
    .attr("r", (d) => (d.data.type === "directory" ? 5 : 3.5))
    .attr("fill", (d) =>
      d.data.type === "directory" ? "#f78166" : "#7ee787"
    );

  nodeGroups
    .append("text")
    .attr("dy", "0.32em")
    .attr("x", (d) => (d.children ? -10 : 10))
    .attr("text-anchor", (d) => (d.children ? "end" : "start"))
    .attr("fill", (d) =>
      d.data.type === "directory" ? "#f0f6fc" : "#c9d1d9"
    )
    .attr("font-size", "13px")
    .attr("font-family", "'SF Mono', 'Fira Code', Consolas, monospace")
    .text((d) => d.data.name);

  // Import count badges
  nodeGroups
    .filter((d) => d.data.type === "file" && (d.data as FileNode).imports.length > 0)
    .append("text")
    .attr("dy", "0.32em")
    .attr("x", (d) => {
      const nameLen = d.data.name.length * 7.8 + 16;
      return d.children ? -nameLen : nameLen;
    })
    .attr("text-anchor", (d) => (d.children ? "end" : "start"))
    .attr("fill", "#8b949e")
    .attr("font-size", "11px")
    .attr("font-family", "'SF Mono', 'Fira Code', Consolas, monospace")
    .text((d) => {
      const imports = (d.data as FileNode).imports;
      const local = imports.filter((i) => !i.isExternal).length;
      const ext = imports.filter((i) => i.isExternal).length;
      const parts = [];
      if (local > 0) parts.push(`${local} dep${local > 1 ? "s" : ""}`);
      if (ext > 0) parts.push(`${ext} ext`);
      return parts.join(", ");
    });

  // Selection state
  let selectedPath: string | null = null;

  function clearSelection() {
    selectedPath = null;
    depLayer.selectAll("*").remove();
    nodeGroups.attr("opacity", 1);
    treeLinks.attr("opacity", 1);
  }

  function selectFile(filePath: string, fileNode: FileNode) {
    selectedPath = filePath;

    // Collect connected file paths
    const connected = new Set<string>([filePath]);
    for (const imp of fileNode.imports) {
      if (imp.resolvedPath && posMap.has(imp.resolvedPath)) {
        connected.add(imp.resolvedPath);
      }
    }
    for (const [p, fn] of fileNodeMap) {
      if (fn.imports.some((i) => i.resolvedPath === filePath)) {
        connected.add(p);
      }
    }

    // Dim unconnected
    nodeGroups.attr("opacity", (d: any) => {
      if (d.data.type === "directory") return 0.2;
      const path = d3NodeToPath.get(d);
      return path && connected.has(path) ? 1 : 0.15;
    });
    treeLinks.attr("opacity", 0.1);

    // Draw dependency edges
    depLayer.selectAll("*").remove();
    const sourcePos = posMap.get(filePath)!;

    // Outgoing (blue)
    for (const imp of fileNode.imports) {
      if (!imp.resolvedPath || !posMap.has(imp.resolvedPath)) continue;
      drawDepEdge(depLayer, sourcePos, posMap.get(imp.resolvedPath)!, "#58a6ff");
    }

    // Incoming (red)
    for (const [p, fn] of fileNodeMap) {
      if (p === filePath) continue;
      if (fn.imports.some((i) => i.resolvedPath === filePath)) {
        const fromPos = posMap.get(p);
        if (fromPos) drawDepEdge(depLayer, fromPos, sourcePos, "#da3633");
      }
    }
  }

  // Click on file nodes
  nodeGroups
    .filter((d) => d.data.type === "file")
    .style("cursor", "pointer")
    .on("click", function (_event: any, d: any) {
      const filePath = d3NodeToPath.get(d);
      if (!filePath) return;
      const fileNode = fileNodeMap.get(filePath);
      if (!fileNode) return;

      if (selectedPath === filePath) {
        clearSelection();
        onDeselect();
      } else {
        selectFile(filePath, fileNode);
        onSelect(filePath, fileNode);
      }
    });

  // Click on SVG background to deselect
  svg.on("click", function (event: any) {
    if (event.target === svg.node()) {
      clearSelection();
      onDeselect();
    }
  });

  return { clearSelection };
}

function drawDepEdge(
  layer: d3.Selection<SVGGElement, unknown, null, undefined>,
  source: { x: number; y: number },
  target: { x: number; y: number },
  color: string
) {
  const dx = target.y - source.y;
  const dy = target.x - source.x;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const bow = Math.min(dist * 0.3, 100);

  const midY = (source.y + target.y) / 2 - bow;
  const midX = (source.x + target.x) / 2;

  layer
    .append("path")
    .attr("d", `M${source.y},${source.x} Q${midY},${midX} ${target.y},${target.x}`)
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.7)
    .attr("stroke-dasharray", "4,3");

  const angle = Math.atan2(target.x - midX, target.y - midY);
  const arrowLen = 8;
  layer
    .append("polygon")
    .attr("points", [
      [target.y, target.x],
      [
        target.y - arrowLen * Math.cos(angle - 0.4),
        target.x - arrowLen * Math.sin(angle - 0.4),
      ],
      [
        target.y - arrowLen * Math.cos(angle + 0.4),
        target.x - arrowLen * Math.sin(angle + 0.4),
      ],
    ].map((p) => p.join(",")).join(" "))
    .attr("fill", color)
    .attr("opacity", 0.8);
}

render(<App />, document.getElementById("app")!);
