/** Stable `list_items.value` from a human label (matches List settings add form). */
export function slugifyListItemValue(label: string): string {
  const x = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  return (x || 'item').slice(0, 80)
}
