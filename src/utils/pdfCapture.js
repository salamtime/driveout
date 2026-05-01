const isJavascriptAssetHint = (node) => {
  if (!node || String(node.tagName || '').toLowerCase() !== 'link') return false;

  const href = String(node.getAttribute('href') || '');
  const rel = String(node.getAttribute('rel') || '').toLowerCase();
  const as = String(node.getAttribute('as') || '').toLowerCase();

  return (
    href.includes('/assets/') &&
    href.split('?')[0].endsWith('.js') &&
    (rel.includes('modulepreload') || rel === 'preload' || rel === 'prefetch' || as === 'script')
  );
};

const pauseJavascriptAssetHints = () => {
  if (typeof document === 'undefined') return [];

  return Array.from(document.querySelectorAll('link[href*="/assets/"]'))
    .filter(isJavascriptAssetHint)
    .map((node) => {
      const placeholder = document.createComment('pdf-capture-asset-hint');
      node.parentNode?.insertBefore(placeholder, node);
      node.remove();
      return { node, placeholder };
    });
};

const restoreJavascriptAssetHints = (records) => {
  records.forEach(({ node, placeholder }) => {
    if (placeholder.parentNode) {
      placeholder.parentNode.insertBefore(node, placeholder);
      placeholder.remove();
    }
  });
};

const removeJavascriptAssetHintsFromClone = (clonedDocument) => {
  clonedDocument
    ?.querySelectorAll?.('script[src], link[rel="modulepreload"], link[rel="preload"][as="script"], link[rel="prefetch"][as="script"]')
    ?.forEach((node) => node.remove());
};

export const captureElementToCanvas = async (html2canvas, element, options = {}) => {
  const pausedHints = pauseJavascriptAssetHints();
  const originalIgnoreElements = options.ignoreElements;
  const originalOnClone = options.onclone;

  try {
    return await html2canvas(element, {
      backgroundColor: '#ffffff',
      logging: false,
      ...options,
      ignoreElements: (node) => {
        if (typeof originalIgnoreElements === 'function' && originalIgnoreElements(node)) {
          return true;
        }

        const tagName = String(node?.tagName || '').toLowerCase();
        return tagName === 'script' || isJavascriptAssetHint(node);
      },
      onclone: (clonedDocument, clonedElement) => {
        removeJavascriptAssetHintsFromClone(clonedDocument);
        if (typeof originalOnClone === 'function') {
          originalOnClone(clonedDocument, clonedElement);
        }
      },
    });
  } finally {
    restoreJavascriptAssetHints(pausedHints);
  }
};
