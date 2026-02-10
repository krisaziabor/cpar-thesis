"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: GraphNode;
  target: GraphNode;
}

const MOCK_NODES: GraphNode[] = [
  { id: "1", name: "Item A" },
  { id: "2", name: "Item B" },
  { id: "3", name: "Item C" },
  { id: "4", name: "Item D" },
];

const MOCK_LINKS = [
  { source: "1", target: "2" },
  { source: "2", target: "3" },
  { source: "3", target: "4" },
  { source: "1", target: "4" },
];

export default function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    const nodes: GraphNode[] = MOCK_NODES.map((d) => ({ ...d }));
    const links: GraphLink[] = MOCK_LINKS.map((d) => ({
      source: nodes.find((n) => n.id === d.source)!,
      target: nodes.find((n) => n.id === d.target)!,
    }));

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3.forceLink(links).id((d) => (d as GraphNode).id).distance(120)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#94a3b8")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 2);

    const node = svg
      .append("g")
      .selectAll<SVGCircleElement, GraphNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 12)
      .attr("fill", "#3b82f6")
      .attr("stroke", "#1e40af")
      .attr("stroke-width", 2)
      .call(
        d3
          .drag<SVGCircleElement, GraphNode>()
          .on("start", (event) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
          })
          .on("drag", (event) => {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
          })
          .on("end", (event) => {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
          })
      );

    const label = svg
      .append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d) => d.name)
      .attr("font-size", 12)
      .attr("dx", 15)
      .attr("dy", 4)
      .attr("fill", "currentColor");

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);
      node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
      label.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0);
    });

    return () => {
      simulation.stop();
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className="w-full rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      width="100%"
      height={600}
      style={{ minHeight: 600 }}
    />
  );
}
