import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import * as d3 from "d3";

interface Import {
  specifier: string;
  kind: string;
  resolvedPath: string | null;
  isExternal: boolean;
}

interface FileNode {
  name: string;
  type: "file";
  extension: string | null;
  imports: Import[];
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

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rootPath, setRootPath] = useState("");

  useEffect(() => {
    fetch("/api/tree")
      .then((res) => res.json())
      .then((data: RootNode) => {
        setRootPath(data.absolutePath);
        if (containerRef.current) {
          renderTree(containerRef.current, data.tree);
        }
      });
  }, []);

  return (
    <div>
      <header>
        <h1>grail</h1>
        {rootPath && <span>{rootPath}</span>}
      </header>
      <div ref={containerRef} class="tree-container" />
    </div>
  );
}

function maxDepth(node: d3.HierarchyNode<ASTNode>): number {
  if (!node.children) return 0;
  return 1 + Math.max(...node.children.map(maxDepth));
}

function renderTree(container: HTMLElement, data: ASTNode) {
  const root = d3.hierarchy(data);
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

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg
    .append("g")
    .attr("transform", `translate(${paddingLeft},${paddingTop})`);

  // curved links
  g.selectAll("path.link")
    .data(treeRoot.links())
    .join("path")
    .attr("fill", "none")
    .attr("stroke", "#30363d")
    .attr("stroke-width", 1.5)
    .attr("d", (d: any) => {
      return `M${d.source.y},${d.source.x}
              C${(d.source.y + d.target.y) / 2},${d.source.x}
               ${(d.source.y + d.target.y) / 2},${d.target.x}
               ${d.target.y},${d.target.x}`;
    });

  // nodes
  const node = g
    .selectAll("g.node")
    .data(descendants)
    .join("g")
    .attr("transform", (d: any) => `translate(${d.y},${d.x})`);

  node
    .append("circle")
    .attr("r", (d) => (d.data.type === "directory" ? 5 : 3.5))
    .attr("fill", (d) =>
      d.data.type === "directory" ? "#f78166" : "#7ee787"
    );

  node
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
}

render(<App />, document.getElementById("app")!);
