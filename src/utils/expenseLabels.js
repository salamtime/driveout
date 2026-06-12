const DEFAULT_EXPENSE_LABELS = ['Food', 'Payroll', 'Office Supplies', 'Mechanic'];
const LABELS_MARKER = 'Labels:';

const normalizeLabel = (value = '') =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);

const uniqueLabels = (labels = []) => {
  const seen = new Set();
  return labels
    .map(normalizeLabel)
    .filter(Boolean)
    .filter((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const getExpenseLabelsStorageKey = (scopeId = 'shared') =>
  `finance_expense_labels_v1:${String(scopeId || 'shared').trim() || 'shared'}`;

export const loadExpenseLabelPresets = (scopeId) => {
  if (typeof window === 'undefined') {
    return DEFAULT_EXPENSE_LABELS;
  }

  try {
    const raw = window.localStorage.getItem(getExpenseLabelsStorageKey(scopeId));
    if (!raw) return DEFAULT_EXPENSE_LABELS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_EXPENSE_LABELS;
    const next = uniqueLabels([...DEFAULT_EXPENSE_LABELS, ...parsed]);
    return next.length > 0 ? next : DEFAULT_EXPENSE_LABELS;
  } catch {
    return DEFAULT_EXPENSE_LABELS;
  }
};

export const saveExpenseLabelPresets = (scopeId, labels = []) => {
  if (typeof window === 'undefined') return;
  const next = uniqueLabels(labels);
  window.localStorage.setItem(getExpenseLabelsStorageKey(scopeId), JSON.stringify(next));
};

export const buildExpenseNote = (note = '', labels = []) => {
  const cleanNote = String(note || '').trim();
  const cleanLabels = uniqueLabels(labels);
  const labelLine = cleanLabels.length > 0 ? `${LABELS_MARKER} ${cleanLabels.join(', ')}` : '';
  return [labelLine, cleanNote].filter(Boolean).join('\n');
};

export const parseExpenseNote = (note = '') => {
  const text = String(note || '');
  const lines = text.split('\n');
  const firstLine = String(lines[0] || '').trim();

  if (!firstLine.startsWith(LABELS_MARKER)) {
    return {
      labels: [],
      noteBody: text.trim(),
    };
  }

  const labelText = firstLine.slice(LABELS_MARKER.length).trim();
  return {
    labels: uniqueLabels(labelText.split(',')),
    noteBody: lines.slice(1).join('\n').trim(),
  };
};

export const buildExpenseDescription = (labels = []) => {
  const cleanLabels = uniqueLabels(labels);
  if (cleanLabels.length === 0) return 'Purchase expense';
  return `Purchase expense • ${cleanLabels.join(', ')}`;
};

export { DEFAULT_EXPENSE_LABELS, uniqueLabels, normalizeLabel };
