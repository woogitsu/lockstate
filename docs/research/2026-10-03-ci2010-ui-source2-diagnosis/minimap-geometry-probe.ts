/** Read-only native probe. Pass directly to page.evaluate; no captured values. */
export function readMinimapGeometry() {
  const selectors = [
    '.hud', '.hud__tabs', '.hud-tabs__inner', '.hud-tabs__inner > .ui-tab', '.hud-strip',
    '.hud__corner', '.hud-camera-pan', '.hud-camera-pose', '.hud-zoom',
    '.hud__corner button', '.hud__corner select',
    '.hud-minimap', '.hud-minimap > .ui-panel__header',
    '.hud-minimap > .ui-panel__body', '.hud-minimap__surface',
    '.hud-minimap .hud-alerts', '.hud-minimap .ui-section__header-row',
    '.hud-minimap .ui-section__body', '.hud-minimap .hud-alerts__list',
    '.hud-minimap [data-alert="empty"]', '.hud__corner > .hud-alerts--detached',
  ];
  function measure(element: Element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const centreHit = rect.width > 0 && rect.height > 0
      ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      : null;
    return {
      tag: element.tagName, classes: element.className,
      hidden: element.hasAttribute('hidden'), ariaExpanded: element.getAttribute('aria-expanded'),
      rect: rect.toJSON(), clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
      display: style.display, visibility: style.visibility, height: style.height,
      minHeight: style.minHeight, maxHeight: style.maxHeight, flex: style.flex,
      overflowY: style.overflowY, gap: style.gap, marginBottom: style.marginBottom,
      paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
      centreHit: centreHit ? { tag: centreHit.tagName, classes: centreHit.className } : null,
      centreHitOwned: centreHit !== null && (centreHit === element || element.contains(centreHit)),
      cameraBlockHeight: rect.height + Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom),
    };
  }
  const list = document.querySelector('.hud-minimap .hud-alerts__list');
  const hud = document.querySelector<HTMLElement>('.hud');
  const row = document.querySelector('.hud__tabs')?.getBoundingClientRect();
  const column = document.querySelector('.hud-tabs__inner')?.getBoundingClientRect();
  const corner = document.querySelector('.hud__corner')?.getBoundingClientRect();
  const strip = document.querySelector('.hud-strip')?.getBoundingClientRect();
  const tabs = [...document.querySelectorAll('.hud-tabs__inner > .ui-tab')];
  const ancestors = [];
  for (let element = list?.parentElement; element; element = element.parentElement) {
    ancestors.push(measure(element));
    if (element.matches('.hud')) break;
  }
  return {
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
    enlarged: document.documentElement.getAttribute('data-ui-scale-enlarged'),
    // Exactly the existing #1292 observable; absent boxes stay explicit nulls.
    middleRowBudget: {
      placement: hud?.dataset['layoutNavigationPlacement'] ?? null,
      sections: tabs.length, rowHeight: row?.height ?? null, columnHeight: column?.height ?? null,
      columnBottom: column?.bottom ?? null, cornerTop: corner?.top ?? null,
      cornerHeight: corner?.height ?? null, cornerLeft: corner?.left ?? null,
      clearance: corner && column ? corner.top - column.bottom : null,
      tallestTab: tabs.length ? Math.max(...tabs.map(tab => tab.getBoundingClientRect().height)) : null,
      stripHeight: strip?.height ?? null,
    },
    boxes: selectors.map(selector => ({ selector, nodes: [...document.querySelectorAll(selector)].map(measure) })),
    listAncestors: ancestors,
  };
}
