import { agentMediaFileName } from "@t3tools/shared/voiceMessage";
import {
  audioMimeTypeFromExtension,
  mediaMimeTypeFromExtension,
} from "@t3tools/shared/mediaPreview";

const DOCUMENT_MIME_TYPES: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".rtf": "application/rtf",
  ".epub": "application/epub+zip",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".html": "text/html",
  ".htm": "text/html",
  ".eml": "message/rfc822",
  ".kml": "application/vnd.google-earth.kml+xml",
  ".kmz": "application/vnd.google-earth.kmz",
  ".gpx": "application/gpx+xml",
  ".geojson": "application/geo+json",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".tgz": "application/gzip",
  ".bz2": "application/x-bzip2",
  ".xz": "application/x-xz",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",
  ".apk": "application/vnd.android.package-archive",
};

/** Android's chooser and viewer intents route on the MIME type, so a delivered file needs one. */
export function agentMediaMimeType(path: string): string {
  const name = agentMediaFileName(path);
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  return (
    DOCUMENT_MIME_TYPES[extension] ??
    mediaMimeTypeFromExtension(extension) ??
    audioMimeTypeFromExtension(extension) ??
    "application/octet-stream"
  );
}
