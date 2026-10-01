/** Repository-relative labels use slash separators on every host. */
export function repositoryPathLabel(path: string): string {
  return path.replaceAll('\\', '/');
}
