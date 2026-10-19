import { describe, expect, it } from "vitest";
import { demoGraph } from "../../data/demoRepository";
import {
  connectionPulse,
  edgeEntrance,
  entrance,
  entranceDuration,
  ambientPulses,
  nodeMotion,
  nodeEntranceDelays,
  starBloom,
} from "./entrance";

describe("branch formation", () => {
  it("keeps peers in tight, varied waves, independent of array order", () => {
    const delays = nodeEntranceDelays(demoGraph.nodes);
    const reversed = nodeEntranceDelays([...demoGraph.nodes].reverse());
    expect(delays).toEqual(reversed);
    expect(delays.get("root")).toBe(0);
    const modules = demoGraph.nodes.filter((node) => node.type === "module");
    const files = demoGraph.nodes.filter((node) => node.importance === 0.25);
    for (const peers of [modules, files]) {
      const starts = peers.map((node) => delays.get(node.id)!);
      expect(new Set(starts).size).toBeGreaterThan(1);
      expect(
        (Math.max(...starts) - Math.min(...starts)) / entrance.playbackRate,
      ).toBeLessThan(0.14);
    }
    expect(delays.get("src/main.tsx")).toBeLessThan(delays.get("src/App.tsx")!);
    expect(delays.get("src/App.tsx")).toBeLessThan(delays.get(files[0].id)!);
  });

  it("launches as the source reaches full size and ignites destinations before arrival", () => {
    const delays = nodeEntranceDelays(demoGraph.nodes);
    for (const edge of demoGraph.edges.filter(
      (edge) => edge.type === "contains",
    )) {
      const animation = edgeEntrance(edge, delays);
      const sourceIsRoot = edge.source === "root";
      const sourceAtLaunch = starBloom(
        animation.start,
        delays.get(edge.source)!,
        sourceIsRoot,
        nodeMotion(edge.source),
      );
      expect(sourceAtLaunch.coreScale).toBeGreaterThanOrEqual(0.99);
      expect(sourceAtLaunch.light).toBeGreaterThanOrEqual(0.99);
      if (sourceIsRoot)
        expect(animation.start).toBeLessThan(entrance.nodeBloom);
      const ignition = delays.get(edge.target)!;
      const incoming = connectionPulse(
        ignition,
        animation.start,
        animation.duration,
      );
      expect(incoming.progress).toBeGreaterThan(0.5);
      expect(incoming.progress).toBeLessThan(0.8);
      const arrival = animation.start + animation.duration;
      const formed = starBloom(
        arrival,
        ignition,
        false,
        nodeMotion(edge.target),
      );
      expect(formed.coreScale).toBeGreaterThan(0.95);
      expect(formed.light).toBeGreaterThan(0.95);
      expect(
        connectionPulse(arrival, animation.start, animation.duration).light,
      ).toBeGreaterThan(0);
      expect(
        connectionPulse(
          arrival + entrance.pulseFade + 0.001,
          animation.start,
          animation.duration,
        ).light,
      ).toBe(0);
      expect(entrance.childBloom).toBeLessThan(entrance.nodeBloom);
    }
  });

  it("preserves the root bloom and finishes the demo, including pulses and labels, in 6–7 seconds", () => {
    const delays = nodeEntranceDelays(demoGraph.nodes);
    const duration = entranceDuration(delays);
    expect(duration / entrance.playbackRate).toBeGreaterThanOrEqual(6);
    expect(duration / entrance.playbackRate).toBeLessThanOrEqual(7);
    for (const time of [0, 0.5, 1.5, 2, 2.9]) {
      expect(starBloom(time, 0, true, nodeMotion("root"))).toEqual(
        starBloom(time, 0),
      );
    }
    for (const node of demoGraph.nodes) {
      const isRoot = !node.parentId;
      const delay = delays.get(node.id)!;
      const motion = nodeMotion(node.id);
      const bloom = starBloom(duration, delay, isRoot, motion);
      expect(bloom.coreScale).toBe(1);
      expect(bloom.light).toBe(1);
      const labelEnd = isRoot
        ? entrance.labelStart + entrance.labelTyping
        : ((entrance.childLabelStart + entrance.childLabelTyping) *
            motion.bloom) /
          entrance.childBloom;
      expect(delay + labelEnd).toBeLessThan(duration);
    }
    for (const edge of demoGraph.edges) {
      const animation = edgeEntrance(edge, delays);
      expect(
        animation.start + animation.duration + entrance.pulseFade,
      ).toBeLessThanOrEqual(duration);
      expect(
        connectionPulse(duration, animation.start, animation.duration),
      ).toEqual({ progress: 1, light: 0 });
    }
  });

  it("varies travel and bloom speeds while keeping pulses smooth and forward-moving", () => {
    const delays = nodeEntranceDelays(demoGraph.nodes);
    const animations = demoGraph.edges.map((edge) =>
      edgeEntrance(edge, delays),
    );
    expect(
      new Set(animations.map((animation) => animation.duration)).size,
    ).toBeGreaterThan(10);
    expect(
      new Set(demoGraph.nodes.map((node) => nodeMotion(node.id).bloom)).size,
    ).toBeGreaterThan(10);
    for (const animation of animations) {
      let previous = 0;
      for (let step = 0; step <= 100; step++) {
        const pulse = connectionPulse(
          animation.start + (animation.duration * step) / 100,
          animation.start,
          animation.duration,
        );
        expect(pulse.progress).toBeGreaterThanOrEqual(previous);
        expect(pulse.progress).toBeLessThanOrEqual(1);
        previous = pulse.progress;
      }
    }
  });

  it("keeps later meteor passes sparse and varies their routes over time", () => {
    expect(ambientPulses(-1, 49)).toEqual([]);
    expect(ambientPulses(10, 0)).toEqual([]);
    const routes = new Set<number>();
    const directions = new Set<boolean>();
    let quietFrames = 0;
    for (let time = 0; time < 100; time += 0.1) {
      const pulses = ambientPulses(time, 49);
      expect(pulses).toEqual(ambientPulses(time, 49));
      expect(pulses.length).toBeLessThanOrEqual(2);
      if (!pulses.length) quietFrames++;
      for (const pulse of pulses) {
        expect(pulse.index).toBeGreaterThanOrEqual(0);
        expect(pulse.index).toBeLessThan(49);
        expect(pulse.light).toBeGreaterThan(0);
        expect(pulse.light).toBeLessThanOrEqual(0.5);
        routes.add(pulse.index);
        directions.add(pulse.reverse);
      }
    }
    expect(routes.size).toBeGreaterThan(10);
    expect(directions.size).toBe(2);
    expect(quietFrames).toBeGreaterThan(0);
  });

  it("directs pulses by visual priority without altering the graph", () => {
    const delays = nodeEntranceDelays(demoGraph.nodes);
    for (const edge of demoGraph.edges.filter(
      (edge) => edge.type === "contains",
    )) {
      const animation = edgeEntrance(edge, delays);
      expect(animation.from).toBe(edge.source);
      expect(animation.to).toBe(edge.target);
      expect(animation.start).toBeLessThan(delays.get(edge.target)!);
    }
    const backwards = edgeEntrance(
      {
        ...demoGraph.edges[0],
        source: "src/App.tsx",
        target: "root",
        type: "imports",
      },
      delays,
    );
    expect(backwards.from).toBe("root");
    expect(backwards.to).toBe("src/App.tsx");
    expect(backwards.start).toBeGreaterThanOrEqual(delays.get("src/App.tsx")!);
  });
});
