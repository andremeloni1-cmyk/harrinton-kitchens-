// Splitting delimited text — shared by every paste-or-upload importer.
//
// Small enough to be tempting to rewrite per feature, and exactly the kind of
// thing that goes subtly wrong when you do: quoting, escaped quotes, and a
// delimiter appearing inside a quoted field are easy to get almost right.

/** Split one delimited line, honouring double quotes around a field. */
export function splitDelimited(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(field.trim());
      field = "";
    } else field += ch;
  }
  out.push(field.trim());
  return out;
}

/**
 * Guess the delimiter from a line, or null when it holds none.
 *
 * Tab first: a tab is never punctuation, so a line containing one is
 * tab-separated even if it also contains commas in its text.
 */
export function detectDelimiter(line: string): string | null {
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  if (line.includes(";")) return ";";
  return null;
}
