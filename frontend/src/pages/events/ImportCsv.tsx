// Import many guests from a CSV file. The server imports all or nothing:
// if any line is wrong, nothing is added and every bad line is listed with
// its line number and the reason, so the organiser fixes the file and tries again.
import { useId, useState } from "react";
import type { ChangeEvent } from "react";
import * as eventsApi from "../../api/events";
import type { ImportResult } from "../../api/events";
import { Button } from "../../design/components";
import type { OrganiserState } from "./useOrganiser";

export function ImportCsv({ org }: { org: OrganiserState }) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    setFile(event.target.files?.[0] ?? null);
    setResult(null);
  };

  const onImport = async (): Promise<void> => {
    if (!file) return;
    const text = await file.text();
    await org.run("import", `Import of ${file.name} finished.`, async () => {
      const answer = await eventsApi.importGuests(org.eventId, text);
      // New guests' links exist only in this answer, so keep them for "Copy link".
      answer.guests.forEach((guest) => org.rememberLink(guest.id, guest.link));
      setResult(answer);
    });
  };

  return (
    <div className="ev-form">
      <h3 className="ev-subtitle">Import from a CSV file</h3>
      <p className="ev-muted" id={`${inputId}-hint`}>
        One guest per line, with a header line. Columns: name and email, plus optional ones such as group. Up to 1000 guests.
      </p>
      <label className="field-label" htmlFor={inputId}>
        CSV file
      </label>
      <input id={inputId} type="file" accept=".csv,text/csv" onChange={onPick} aria-describedby={`${inputId}-hint`} className="ev-file" />
      <Button variant="secondary" busy={org.busy === "import"} disabled={!file} onClick={() => void onImport()}>
        Import guests
      </Button>
      {result && <ImportReport result={result} />}
    </div>
  );
}

function ImportReport({ result }: { result: ImportResult }) {
  const errorCount = result.errors.length;
  if (errorCount === 0) {
    return (
      <p className="ev-report" role="status">
        <strong>
          Added {result.imported} {result.imported === 1 ? "guest" : "guests"}.
        </strong>{" "}
        Their personal links are ready to copy in the list.
      </p>
    );
  }
  return (
    <div className="ev-report" role="status">
      <p>
        <strong>Nothing was imported yet.</strong> {errorCount} {errorCount === 1 ? "line needs" : "lines need"} fixing first. Correct the
        file and import it again:
      </p>
      <table className="ev-table">
        <caption className="visually-hidden">Lines to fix before importing</caption>
        <thead>
          <tr>
            <th scope="col">Line</th>
            <th scope="col">Problem</th>
          </tr>
        </thead>
        <tbody>
          {result.errors.map((error) => (
            <tr key={`${error.line}-${error.message}`}>
              <td className="tabular">{error.line}</td>
              <td>{error.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
