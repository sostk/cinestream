let activeBase = '';

export function getOmssBaseUrl(): string {
  return activeBase;
}

export function setOmssBaseUrl(url: string): void {
  activeBase = url.trim().replace(/\/$/, '');
}
