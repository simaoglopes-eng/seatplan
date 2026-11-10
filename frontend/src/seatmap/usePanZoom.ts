// Pan and zoom for an SVG map, with pointer events so mouse, pen and touch
// share one code path: one finger (or the mouse) drags, two fingers pinch,
// the mouse wheel zooms around the cursor.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { MAX_ZOOM, MIN_ZOOM, clamp, fitView, zoomAround } from "./geometry";
import type { Bounds, View } from "./geometry";

// Movement below this many pixels is still a tap, so a slightly shaky
// finger can select a seat without dragging the map.
const DRAG_THRESHOLD_PX = 5;
const KEEP_VISIBLE_MARGIN_PX = 48;

interface ScreenPoint {
  x: number;
  y: number;
}

export interface PointerHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

/** Optional hints for the automatic first view (the editor uses none). */
export interface CameraHints {
  /** Never fit below this zoom, so targets stay big enough to tap. */
  minK?: number;
  /** Where to look first when the whole floor does not fit, e.g. the recommended seat. */
  getFocus?: () => { x: number; y: number } | null;
}

export interface PanZoom {
  view: View;
  zoomBy: (factor: number) => void;
  /** Shows the whole floor, however small that makes it. */
  fit: () => void;
  ensureVisible: (x: number, y: number) => void;
  /** Centres (x, y) and zooms in to at least `k`. */
  focusOn: (x: number, y: number, k: number) => void;
  /** True when the gesture that just ended moved the map (so it was not a tap). */
  wasDragged: () => boolean;
  pointerHandlers: PointerHandlers;
}

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

type Size = () => { w: number; h: number };

export function usePanZoom(viewportRef: RefObject<HTMLElement | null>, bounds: Bounds, hints: CameraHints = {}): PanZoom {
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const pointers = useRef(new Map<number, ScreenPoint>());
  const dragging = useRef(false);
  const travelled = useRef(0);
  // Once the person pans or zooms, we stop re-fitting the map on resize or
  // data refresh: moving their camera under them would be disorienting.
  const touched = useRef(false);
  // Latest-value ref: the focus changes on every pick, which must not re-fit the map.
  const hintsRef = useRef(hints);
  hintsRef.current = hints;

  const size = useCallback<Size>(() => {
    const el = viewportRef.current;
    return { w: el?.clientWidth ?? 0, h: el?.clientHeight ?? 0 };
  }, [viewportRef]);

  // Depend on the four numbers, not the object: a live refresh builds a new
  // bounds object with the same values, and that must not re-fit the camera.
  const { minX, minY, maxX, maxY } = bounds;
  const showView = useCallback(
    (minK: number, focus?: { x: number; y: number } | null): void => {
      const { w, h } = size();
      if (w === 0 || h === 0) return; // not laid out yet (or a test without layout)
      const next = fitView({ minX, minY, maxX, maxY }, w, h, minK, focus ?? undefined);
      // Returning the same object when nothing changed lets React skip a re-render.
      setView((v) => (v.x === next.x && v.y === next.y && v.k === next.k ? v : next));
    },
    [minX, minY, maxX, maxY, size],
  );

  const autoFit = useCallback((): void => {
    showView(hintsRef.current.minK ?? MIN_ZOOM, hintsRef.current.getFocus?.());
  }, [showView]);

  const fit = useCallback((): void => {
    touched.current = true; // the person chose this view; keep it on resize
    showView(MIN_ZOOM);
  }, [showView]);

  useAutoFit(viewportRef, autoFit, touched);
  useWheelZoom(viewportRef, setView, touched);

  const moves = useCameraMoves(size, setView, touched);
  const pointerHandlers = usePointerGestures(viewportRef, setView, { pointers, dragging, travelled, touched });

  return { view, ...moves, fit, wasDragged: () => dragging.current, pointerHandlers };
}

/** The camera moves buttons and keys ask for: zoom, keep a point on screen, focus a point. */
function useCameraMoves(size: Size, setView: (update: (v: View) => View) => void, touched: { current: boolean }) {
  const zoomBy = useCallback(
    (factor: number): void => {
      const { w, h } = size();
      touched.current = true;
      setView((v) => zoomAround(v, factor, w / 2, h / 2));
    },
    [size],
  );

  const ensureVisible = useCallback(
    (x: number, y: number): void => {
      const { w, h } = size();
      if (w === 0 || h === 0) return;
      setView((v) => {
        const sx = x * v.k + v.x;
        const sy = y * v.k + v.y;
        const m = KEEP_VISIBLE_MARGIN_PX;
        if (sx > m && sx < w - m && sy > m && sy < h - m) return v;
        return { ...v, x: w / 2 - x * v.k, y: h / 2 - y * v.k };
      });
    },
    [size],
  );

  const focusOn = useCallback(
    (x: number, y: number, k: number): void => {
      const { w, h } = size();
      touched.current = true;
      setView((v) => {
        const zoom = clamp(Math.max(v.k, k), MIN_ZOOM, MAX_ZOOM);
        return { k: zoom, x: w / 2 - x * zoom, y: h / 2 - y * zoom };
      });
    },
    [size],
  );

  return { zoomBy, ensureVisible, focusOn };
}

/** Fits once the viewport has a size, and again on resize until the person takes over. */
function useAutoFit(viewportRef: RefObject<HTMLElement | null>, fit: () => void, touched: { current: boolean }): void {
  useLayoutEffect(() => {
    if (!touched.current) fit();
  }, [fit, touched]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      if (!touched.current) fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewportRef, fit, touched]);
}

/**
 * React registers wheel listeners as "passive", which forbids preventDefault,
 * so the page would scroll while the map zooms. A native listener fixes that.
 */
function useWheelZoom(
  viewportRef: RefObject<HTMLElement | null>,
  setView: (update: (v: View) => View) => void,
  touched: { current: boolean },
): void {
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      touched.current = true;
      const rect = el.getBoundingClientRect();
      // exp() makes zoom feel even: the same wheel distance always doubles or halves.
      const factor = Math.exp(-event.deltaY * 0.0015);
      setView((v) => zoomAround(v, factor, event.clientX - rect.left, event.clientY - rect.top));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [viewportRef, setView, touched]);
}

interface GestureRefs {
  pointers: { current: Map<number, ScreenPoint> };
  dragging: { current: boolean };
  travelled: { current: number };
  touched: { current: boolean };
}

/** Turns raw pointer events into pans (one pointer) and pinches (two pointers). */
function usePointerGestures(
  viewportRef: RefObject<HTMLElement | null>,
  setView: (update: (v: View) => View) => void,
  refs: GestureRefs,
): PointerHandlers {
  const local = (event: ReactPointerEvent<HTMLElement>): ScreenPoint => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (refs.pointers.current.size === 0) {
      refs.dragging.current = false; // a new gesture starts
      refs.travelled.current = 0;
    }
    refs.pointers.current.set(event.pointerId, local(event));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const previous = refs.pointers.current.get(event.pointerId);
    if (!previous) return;
    const now = local(event);
    const others = [...refs.pointers.current.entries()].filter(([id]) => id !== event.pointerId);
    refs.pointers.current.set(event.pointerId, now);
    if (others.length === 0) {
      panBy(event, previous, now);
    } else {
      pinch(others[0][1], previous, now);
    }
  };

  const panBy = (event: ReactPointerEvent<HTMLElement>, previous: ScreenPoint, now: ScreenPoint): void => {
    refs.travelled.current += distance(previous, now);
    if (!refs.dragging.current && refs.travelled.current < DRAG_THRESHOLD_PX) return;
    if (!refs.dragging.current) {
      refs.dragging.current = true;
      // Capture only once it is a real drag; capturing on pointerdown would
      // steal the click from the seat under the finger.
      viewportRef.current?.setPointerCapture?.(event.pointerId);
    }
    refs.touched.current = true;
    setView((v) => ({ ...v, x: v.x + now.x - previous.x, y: v.y + now.y - previous.y }));
  };

  const pinch = (anchor: ScreenPoint, previous: ScreenPoint, now: ScreenPoint): void => {
    const before = distance(anchor, previous);
    if (before === 0) return;
    const factor = distance(anchor, now) / before;
    const oldMid = midpoint(anchor, previous);
    const newMid = midpoint(anchor, now);
    refs.dragging.current = true;
    refs.touched.current = true;
    setView((v) => zoomAround({ ...v, x: v.x + newMid.x - oldMid.x, y: v.y + newMid.y - oldMid.y }, factor, newMid.x, newMid.y));
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>): void => {
    refs.pointers.current.delete(event.pointerId);
  };

  return { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
}
