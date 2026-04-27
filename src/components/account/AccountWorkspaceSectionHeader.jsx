import React from 'react';
import {
  workspaceEyebrowClass,
  workspaceSectionDescriptionClass,
} from './accountWorkspaceDesignSystem';

const AccountWorkspaceSectionHeader = ({
  eyebrow,
  title,
  description,
  actions,
  titleClassName = 'mt-1 text-xl font-bold text-slate-950',
}) => (
  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div className="min-w-0 flex-1">
      {eyebrow ? <p className={workspaceEyebrowClass}>{eyebrow}</p> : null}
      {title ? <h2 className={titleClassName}>{title}</h2> : null}
      {description ? <p className={workspaceSectionDescriptionClass}>{description}</p> : null}
    </div>
    {actions ? <div className="w-full lg:w-auto lg:shrink-0">{actions}</div> : null}
  </div>
);

export default AccountWorkspaceSectionHeader;
