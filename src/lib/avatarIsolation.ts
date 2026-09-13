/**
 * Isolates SVG IDs, mask URLs, clip-paths, and href references within rendered
 * SVG/HTML markup so that multiple avatars on the same page do not collide.
 */
export function isolateAvatarSvgMarkup(html: string, namespace: string): string {
  if (!html || !namespace) return html;

  const cleanNamespace = namespace.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanNamespace) return html;

  // Identify all id="..." attributes
  const idRegex = /\bid=["']([^"']+)["']/g;
  const ids = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = idRegex.exec(html)) !== null) {
    const originalId = match[1];
    if (!originalId.endsWith(`_${cleanNamespace}`)) {
      ids.add(originalId);
    }
  }

  let result = html;
  ids.forEach((originalId) => {
    const namespacedId = `${originalId}_${cleanNamespace}`;
    result = result
      .split(`id="${originalId}"`).join(`id="${namespacedId}"`)
      .split(`id='${originalId}'`).join(`id='${namespacedId}'`)
      .split(`url(#${originalId})`).join(`url(#${namespacedId})`)
      .split(`url('#${originalId}')`).join(`url('#${namespacedId}')`)
      .split(`url("#${originalId}")`).join(`url("#${namespacedId}")`)
      .split(`href="#${originalId}"`).join(`href="#${namespacedId}"`)
      .split(`href='#${originalId}'`).join(`href='#${namespacedId}'`)
      .split(`xlink:href="#${originalId}"`).join(`xlink:href="#${namespacedId}"`);
  });

  return result;
}
