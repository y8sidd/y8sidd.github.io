import { create } from "zustand";
import type { SourceCitation } from "../types/repository";
import { defaultFilter, type GraphFilter } from "../lib/graphUtils";
export type Overlay =
  | { kind: "none" }
  | { kind: "search" | "mentor" | "help" | "settings" | "filters" | "list" }
  | { kind: "code"; path: string; citation?: SourceCitation };
export type CameraAction = "reset" | "fit" | "in" | "out" | "focus";
interface ExperienceState {
  selected: string | null;
  hovered: string | null;
  overlay: Overlay;
  filter: GraphFilter;
  autoRotate: boolean;
  reducedDetail: boolean;
  interacted: boolean;
  camera: { action: CameraAction; sequence: number };
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  open: (overlay: Overlay) => void;
  close: () => void;
  setFilter: (filter: Partial<GraphFilter>) => void;
  setAutoRotate: (on: boolean) => void;
  setReducedDetail: (on: boolean) => void;
  interact: () => void;
  moveCamera: (action: CameraAction) => void;
  reset: () => void;
}
export const useExperience = create<ExperienceState>((set) => ({
  selected: null,
  hovered: null,
  overlay: { kind: "none" },
  filter: defaultFilter,
  autoRotate: true,
  reducedDetail: false,
  interacted: false,
  camera: { action: "reset", sequence: 0 },
  select: (id) =>
    set((s) => ({
      selected: id,
      interacted: true,
      camera: id
        ? { action: "focus", sequence: s.camera.sequence + 1 }
        : s.camera,
    })),
  hover: (id) => set({ hovered: id }),
  open: (overlay) => set({ overlay, interacted: true }),
  close: () => set({ overlay: { kind: "none" } }),
  setFilter: (filter) => set((s) => ({ filter: { ...s.filter, ...filter } })),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  setReducedDetail: (reducedDetail) => set({ reducedDetail }),
  interact: () => set({ interacted: true }),
  moveCamera: (action) =>
    set((s) => ({
      camera: { action, sequence: s.camera.sequence + 1 },
      interacted: true,
    })),
  reset: () =>
    set((s) => ({
      selected: null,
      hovered: null,
      overlay: { kind: "none" },
      filter: defaultFilter,
      interacted: false,
      camera: { action: "reset", sequence: s.camera.sequence + 1 },
    })),
}));
