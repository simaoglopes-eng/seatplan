// Add items, undo and redo, and save. A toolbar landmark so screen-reader
// users can jump straight to it.
import type { TableShape } from "../../api/types";
import { Badge, Button } from "../../design/components";

interface ToolbarProps {
  onAddTable: (shape: TableShape) => void;
  onAddZone: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  dirty: boolean;
}

export function EditorToolbar(props: ToolbarProps) {
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Floor plan tools">
      <div className="editor-toolbar-group">
        <Button variant="secondary" onClick={() => props.onAddTable("round")}>+ Round table</Button>
        <Button variant="secondary" onClick={() => props.onAddTable("rect")}>+ Long table</Button>
        <Button variant="secondary" onClick={() => props.onAddTable("row")}>+ Theatre row</Button>
        <Button variant="secondary" onClick={props.onAddZone}>+ Zone</Button>
      </div>
      <div className="editor-toolbar-group">
        <Button variant="ghost" onClick={props.onUndo} disabled={!props.canUndo} aria-keyshortcuts="Control+Z Meta+Z">Undo</Button>
        <Button variant="ghost" onClick={props.onRedo} disabled={!props.canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y">Redo</Button>
        {props.dirty ? <Badge tone="warning">Unsaved changes</Badge> : <Badge tone="success">All changes saved</Badge>}
        <Button onClick={props.onSave} busy={props.saving} disabled={!props.dirty}>Save layout</Button>
      </div>
    </div>
  );
}
