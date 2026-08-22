import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLazySearchProductTreeQuery } from '../../api/posApi';
import type { ProductTreeNode, ProductTreeSearchFilter, ProductTreeSearchResult } from '../../types';
import { useDebouncedCallback } from '../../utils/debounce';

type TreeNodeKind = 'root' | 'group' | 'category' | 'brand' | 'product' | 'serial';

interface FlatTreeRow {
  id: string;
  label: string;
  icon: string;
  kind: TreeNodeKind;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isModel: boolean;
  isSelected: boolean;
  bold?: boolean;
  path?: string;
  productId?: number;
}

const ROW_HEIGHT = 34;
const SEARCH_ROW_HEIGHT = 42;

const SEARCH_FILTERS: { id: ProductTreeSearchFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'group', label: 'Group' },
  { id: 'brand', label: 'Brand' },
  { id: 'category', label: 'Category' },
  { id: 'product', label: 'Product' },
  { id: 'serial', label: 'Serial' },
];

function nodeKind(node: ProductTreeNode): TreeNodeKind {
  if (node.isModel || node.id.startsWith('p-')) return 'product';
  if (node.id.startsWith('c-')) return 'category';
  if (node.id.startsWith('b-')) return 'brand';
  if (node.id.startsWith('g-')) return 'group';
  return 'root';
}

function collectInitiallyExpanded(nodes: ProductTreeNode[], out = new Set<string>()) {
  for (const node of nodes) {
    if (node.open) {
      out.add(node.id);
      if (node.children.length > 0) collectInitiallyExpanded(node.children, out);
    }
  }
  return out;
}

function flattenVisibleTree(
  nodes: ProductTreeNode[],
  expanded: Set<string>,
  selectedId: string | null,
  depth = 0,
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];

  for (const node of nodes) {
    const kind = nodeKind(node);
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);

    rows.push({
      id: node.id,
      label: node.label,
      icon: node.icon,
      kind,
      depth,
      hasChildren,
      isExpanded,
      isModel: node.isModel,
      isSelected: selectedId === node.id,
      bold: node.bold,
    });

    if (hasChildren && isExpanded) {
      rows.push(...flattenVisibleTree(node.children, expanded, selectedId, depth + 1));
    }
  }

  return rows;
}

function mapSearchResults(results: ProductTreeSearchResult[]): FlatTreeRow[] {
  return results.map((r) => ({
    id: r.id,
    label: r.label,
    icon: r.icon,
    kind: r.matchType === 'all' ? 'product' : r.matchType,
    depth: 0,
    hasChildren: false,
    isExpanded: false,
    isModel: !!r.productId,
    isSelected: false,
    path: r.path,
    productId: r.productId,
  }));
}

export function TreeSidebar({
  open,
  nodes,
  companyId,
  locationId,
  onClose,
  onSelectModel,
}: {
  open: boolean;
  nodes: ProductTreeNode[];
  companyId: number;
  locationId: number;
  onClose: () => void;
  onSelectModel: (model: string, productId?: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(() => collectInitiallyExpanded(nodes));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFilter, setSearchFilter] = useState<ProductTreeSearchFilter>('all');
  const [searchResults, setSearchResults] = useState<ProductTreeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const [searchProductTree] = useLazySearchProductTreeQuery();
  const searchResultMap = useRef(new Map<string, ProductTreeSearchResult>());

  const isSearchMode = searchTerm.trim().length >= 2;

  useEffect(() => {
    setExpanded(collectInitiallyExpanded(nodes));
  }, [nodes]);

  const runSearch = useDebouncedCallback(async (term: string, filter: ProductTreeSearchFilter) => {
    const trimmed = term.trim();
    setSearchTerm(trimmed);
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      searchResultMap.current.clear();
      return;
    }

    setSearching(true);
    try {
      const result = await searchProductTree({
        q: trimmed,
        filter,
        companyId: companyId > 0 ? companyId : undefined,
        locationId: locationId > 0 ? locationId : undefined,
        limit: 200,
      }).unwrap();
      searchResultMap.current = new Map(result.map((r) => [r.id, r]));
      setSearchResults(result);
    } catch {
      searchResultMap.current.clear();
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, 300);

  useEffect(() => {
    if (!open) return;
    void runSearch(searchDraft, searchFilter);
  }, [searchDraft, searchFilter, companyId, locationId, open, runSearch]);

  const treeRows = useMemo(
    () => (open && !isSearchMode ? flattenVisibleTree(nodes, expanded, selectedId) : []),
    [nodes, expanded, selectedId, open, isSearchMode],
  );

  const rows = useMemo(
    () => (isSearchMode ? mapSearchResults(searchResults) : treeRows),
    [isSearchMode, searchResults, treeRows],
  );

  const rowHeight = isSearchMode ? SEARCH_ROW_HEIGHT : ROW_HEIGHT;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 16,
  });

  useEffect(() => {
    if (!scrollToId || isSearchMode) return;
    const idx = treeRows.findIndex((r) => r.id === scrollToId);
    if (idx >= 0) {
      virtualizer.scrollToIndex(idx, { align: 'center' });
      setScrollToId(null);
    }
  }, [treeRows, scrollToId, isSearchMode, virtualizer]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSearchPick = useCallback((result: ProductTreeSearchResult) => {
    if (result.productId) {
      setSelectedId(result.id);
      onSelectModel(result.label, result.productId);
      return;
    }

    setSearchDraft('');
    setSearchTerm('');
    setSearchResults([]);
    searchResultMap.current.clear();
    setExpanded(new Set(result.expandIds));
    setScrollToId(result.id);
  }, [onSelectModel]);

  const handleRowClick = useCallback((row: FlatTreeRow) => {
    if (isSearchMode) {
      const result = searchResultMap.current.get(row.id);
      if (result) handleSearchPick(result);
      return;
    }

    if (row.hasChildren) {
      toggleExpanded(row.id);
      return;
    }

    if (row.isModel) {
      const productId = row.id.startsWith('p-') ? Number(row.id.slice(2)) : undefined;
      setSelectedId(row.id);
      onSelectModel(row.label, productId);
    }
  }, [handleSearchPick, isSearchMode, onSelectModel, toggleExpanded]);

  return (
    <aside className={`tree-sidebar${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="tsb-head">
        <div className="tsb-title">
          <span className="tsb-title-icon" aria-hidden="true">🌳</span>
          Product Tree
          {open && rows.length > 0 && (
            <span className="tsb-count">{rows.length.toLocaleString()}</span>
          )}
        </div>
        <button type="button" className="tsb-close" onClick={onClose} aria-label="Close tree">
          ✕
        </button>
      </div>

      {open && (
        <div className="tsb-search-wrap">
          <div className="tsb-search-row">
            <input
              className="tsb-search"
              value={searchDraft}
              placeholder="Search group, brand, category, product, serial..."
              onChange={(e) => setSearchDraft(e.target.value)}
            />
            <select
              className="tsb-search-filter"
              value={searchFilter}
              aria-label="Search filter"
              onChange={(e) => setSearchFilter(e.target.value as ProductTreeSearchFilter)}
            >
              {SEARCH_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          {searching && <div className="tsb-search-hint">Searching...</div>}
          {isSearchMode && !searching && (
            <div className="tsb-search-hint">
              {searchResults.length > 0
                ? `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`
                : 'No matches found'}
            </div>
          )}
        </div>
      )}

      <div ref={scrollRef} className="tsb-body" role="tree">
        {open && rows.length > 0 && (
          <div className="tsb-v-list" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              const indent = isSearchMode ? 8 : row.depth * 14;

              return (
                <div
                  key={row.id}
                  className="tsb-v-row"
                  style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
                >
                  <div
                    role="treeitem"
                    aria-expanded={row.hasChildren ? row.isExpanded : undefined}
                    className={[
                      'tn-item',
                      `tn-item--${row.kind}`,
                      row.bold ? 'tn-root' : '',
                      row.isModel ? 'tn-model' : '',
                      row.isSelected ? 'selected' : '',
                      isSearchMode ? 'tn-item--search' : '',
                    ].filter(Boolean).join(' ')}
                    style={{ paddingLeft: indent + (row.hasChildren ? 4 : 17) }}
                    onClick={() => handleRowClick(row)}
                  >
                    {!isSearchMode && (
                      <span className={`tn-arrow${row.hasChildren ? '' : ' leaf'}${row.isExpanded ? ' open' : ''}`}>
                        <svg viewBox="0 0 10 10" aria-hidden="true">
                          <path d="M3 1.5 L8 5 L3 8.5 Z" fill="currentColor" />
                        </svg>
                      </span>
                    )}
                    <span className="tn-icon" aria-hidden="true">{row.icon}</span>
                    <span className="tn-text">
                      <span className="tn-label">{row.label}</span>
                      {row.path && isSearchMode && (
                        <span className="tn-path">{row.path}</span>
                      )}
                    </span>
                    {isSearchMode && (
                      <span className={`tn-kind tn-kind--${row.kind}`}>{row.kind}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
