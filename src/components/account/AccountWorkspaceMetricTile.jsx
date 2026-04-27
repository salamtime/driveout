import React from 'react';
import { workspaceMetricCardClass } from './accountWorkspaceDesignSystem';

const AccountWorkspaceMetricTile = ({
  eyebrow,
  value,
  label,
  className = '',
  eyebrowClassName = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400',
  valueClassName = 'mt-1 text-xl font-bold text-slate-950',
  labelClassName = 'mt-2 text-sm font-medium text-slate-500',
}) => (
  <div className={`${workspaceMetricCardClass} ${className}`.trim()}>
    {eyebrow ? <p className={eyebrowClassName}>{eyebrow}</p> : null}
    {value ? <p className={valueClassName}>{value}</p> : null}
    {label ? <p className={labelClassName}>{label}</p> : null}
  </div>
);

export default AccountWorkspaceMetricTile;
