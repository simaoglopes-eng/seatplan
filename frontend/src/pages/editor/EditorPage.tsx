// Floor-plan editor (/editor/:venueId). Laptop-first: toolbar on top,
// canvas in the middle, properties panel on the right.
//
// Data flow: load the venue -> edit a layout held in useHistory -> PUT the
// whole layout back. The server assigns ids; we then reset the history so an
// undo can never bring back a version without those ids.
import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, getVenue, saveLayout } from "../../api/client";
import type { TableShape } from "../../api/types";
import { Button, ErrorState, PageShell, Skeleton, useToast } from "../../design/components";
import { EditorCanvas } from "./EditorCanvas";
import { EditorToolbar } from "./EditorToolbar";
import { createTable, createZone, nudge, removeItem, replaceTable, replaceZone, reshapeTable } from "./layoutModel";
import type { Selection, VenueLayout } from "./layoutModel";
import { layoutFromVenue, payloadFromLayout } from "./layoutWire";
import { PropertiesPanel } from "./PropertiesPanel";
import { useHistory } from "./useHistory";
import type { History } from "./useHistory";
import { useUnsavedGuard } from "./useUnsavedGuard";
import "./editor.css";

const EMPTY_LAYOUT: VenueLayout = { zones: [], tables: [] };
// Used when someone starts from a blank floor without a loaded venue.
const BLANK_VENUE = { name: "New floor", width: 1000, height: 700 };

interface VenueInfo {
  name: string;
  width: number;
  height: number;
}

type LoadState = { kind: "loading" } | { kind: "error"; error: unknown } | { kind: "ready"; venue: VenueInfo };

export default function EditorPage() {
  const { venueId = "" } = useParams();
  const toast = useToast();
  const history = useHistory<VenueLayout>(EMPTY_LAYOUT);
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [savedLayout, setSavedLayout] = useState<VenueLayout>(EMPTY_LAYOUT);
  const [selection, setSelection] = useState<Selection>(null);
  const [saving, setSaving] = useState(false);
  const { reset } = history;
  const dirty = load.kind === "ready" && history.present !== savedLayout;
  useUnsavedGuard(dirty);

  const start = useCallback(
    (venue: VenueInfo, layout: VenueLayout) => {
      reset(layout);
      setSavedLayout(layout);
      setSelection(null);
      setLoad({ kind: "ready", venue });
    },
    [reset],
  );

  const fetchVenue = useCallback(() => {
    setLoad({ kind: "loading" });
    getVenue(venueId)
      .then((detail) => start(detail, layoutFromVenue(detail)))
      .catch((error: unknown) => setLoad({ kind: "error", error }));
  }, [venueId, start]);

  useEffect(fetchVenue, [fetchVenue]);

  const onSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = layoutFromVenue(await saveLayout(venueId, payloadFromLayout(history.present)));
      reset(saved);
      setSavedLayout(saved);
      setSelection(null);
      toast.show("Layout saved.", "success");
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : "The layout could not be saved.", "danger");
    } finally {
      setSaving(false);
    }
  };

  if (load.kind === "loading") return <EditorFrame><Skeleton lines={6} label="Loading the floor plan" /></EditorFrame>;
  if (load.kind === "error") {
    return <EditorFrame><LoadError error={load.error} venueId={venueId} onRetry={fetchVenue} onBlank={() => start(BLANK_VENUE, EMPTY_LAYOUT)} /></EditorFrame>;
  }
  return (
    <EditorWorkspace
      venue={load.venue}
      history={history}
      selection={selection}
      setSelection={setSelection}
      dirty={dirty}
      saving={saving}
      onSave={() => void onSave()}
    />
  );
}

function EditorFrame({ children, title = "Floor plan editor" }: { children: ReactNode; title?: string }) {
  return (
    <PageShell title={title} width="wide">
      {children}
    </PageShell>
  );
}

function LoadError({ error, venueId, onRetry, onBlank }: { error: unknown; venueId: string; onRetry: () => void; onBlank: () => void }) {
  const needsLogin = error instanceof ApiError && (error.code === "unauthorised" || error.code === "forbidden");
  const message = error instanceof ApiError ? error.message : "The venue could not be loaded.";
  return (
    <ErrorState title={needsLogin ? "Please sign in to edit this floor" : "This floor plan could not be loaded"} message={message} onRetry={onRetry}>
      <div className="editor-error-actions">
        {needsLogin && <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(`/editor/${venueId}`)}`}>Sign in</Link>}
        <Button variant="ghost" onClick={onBlank}>Start with an empty floor</Button>
      </div>
    </ErrorState>
  );
}

interface WorkspaceProps {
  venue: VenueInfo;
  history: History<VenueLayout>;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

function EditorWorkspace({ venue, history, selection, setSelection, dirty, saving, onSave }: WorkspaceProps) {
  const layout = history.present;

  // New items are dealt onto a 5 by 4 grid of free spots, so they never land on top of each other.
  const placement = (): { x: number; y: number } => {
    const index = (layout.tables.length + layout.zones.length) % 20;
    const column = index % 5;
    const row = Math.floor(index / 5);
    return { x: (venue.width * (column + 0.5)) / 5, y: (venue.height * (row + 0.5)) / 4 };
  };

  const addTable = (shape: TableShape): void => {
    const table = createTable(layout, shape, placement());
    history.commit({ ...layout, tables: [...layout.tables, table] });
    setSelection({ kind: "table", key: table.key });
  };

  const addZone = (): void => {
    const zone = createZone(placement());
    history.commit({ ...layout, zones: [...layout.zones, zone] });
    setSelection({ kind: "zone", key: zone.key });
  };

  const deleteSelected = (): void => {
    history.commit(removeItem(layout, selection));
    setSelection(null);
  };

  const onDragMove = (target: NonNullable<Selection>, x: number, y: number): void => {
    if (target.kind === "table") history.replace(replaceTable(layout, target.key, (t) => reshapeTable(t, { x, y })));
    if (target.kind === "zone") history.replace(replaceZone(layout, target.key, { x, y }));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (handleEditorKey(event, { history, selection, setSelection, deleteSelected })) event.preventDefault();
  };

  return (
    <EditorFrame title={`Edit ${venue.name}`}>
      <div className="editor" onKeyDown={onKeyDown}>
        <div className="editor-head">
          <h1 className="editor-title">{venue.name}</h1>
          <EditorToolbar onAddTable={addTable} onAddZone={addZone} onUndo={history.undo} onRedo={history.redo} onSave={onSave}
            canUndo={history.canUndo} canRedo={history.canRedo} saving={saving} dirty={dirty} />
        </div>
        <div className="editor-body">
          <EditorCanvas layout={layout} width={venue.width} height={venue.height} selection={selection}
            onSelect={setSelection} onDragStart={history.checkpoint} onDragMove={onDragMove} />
          <aside className="editor-panel" aria-label="Properties">
            <PropertiesPanel layout={layout} selection={selection} onChange={history.commit} onSelect={setSelection} onDelete={deleteSelected} />
          </aside>
        </div>
      </div>
    </EditorFrame>
  );
}

interface KeyContext {
  history: History<VenueLayout>;
  selection: Selection;
  setSelection: (selection: Selection) => void;
  deleteSelected: () => void;
}

const NUDGE: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

/** Editor shortcuts. Returns true when the key was used. */
function handleEditorKey(event: KeyboardEvent, ctx: KeyContext): boolean {
  // Typing in a form field must never move tables or undo the layout.
  const tag = (event.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return false;
  const command = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (command && key === "z") {
    if (event.shiftKey) ctx.history.redo();
    else ctx.history.undo();
    return true;
  }
  if (command && key === "y") {
    ctx.history.redo();
    return true;
  }
  const step = NUDGE[event.key];
  if (step && (ctx.selection?.kind === "table" || ctx.selection?.kind === "zone")) {
    const distance = event.shiftKey ? 25 : 5;
    ctx.history.commit(nudge(ctx.history.present, ctx.selection, step[0] * distance, step[1] * distance));
    return true;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && ctx.selection && ctx.selection.kind !== "seat") {
    ctx.deleteSelected();
    return true;
  }
  if (event.key === "Escape" && ctx.selection) {
    ctx.setSelection(null);
    return true;
  }
  return false;
}
