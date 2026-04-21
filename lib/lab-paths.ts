/** Dev / QA routes at `/*-lab` (e.g. `/metadata-lab`). Admin-only; hide main app chrome. */
export function isLabPathname(pathname: string | null | undefined): boolean {
  return Boolean(pathname && pathname.endsWith("-lab"));
}
