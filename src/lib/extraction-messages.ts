export const QUOTA_MESSAGE = "Daily AI limit reached, try again tomorrow";
export const EXTRACT_UNCONFIGURED = "Extraction is not configured.";
export const EXTRACT_UNUSABLE = "The model returned an unusable extraction. Try again.";

export function isExtractionFailure(error: string | null) {
  if (!error) return false;
  return (
    error === QUOTA_MESSAGE ||
    error === EXTRACT_UNCONFIGURED ||
    error === EXTRACT_UNUSABLE ||
    error.startsWith("Extraction failed")
  );
}

export function extractionFailure(message: string) {
  if (isExtractionFailure(message)) return message;
  return `Extraction failed. ${message}`;
}
