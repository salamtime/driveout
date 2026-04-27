import React from 'react';
import {
  workspacePageShellClass,
  workspaceShellClass,
  workspaceEyebrowClass,
  workspaceTitleClass,
  workspaceSectionDescriptionClass,
} from './accountWorkspaceDesignSystem';

const AccountWorkspaceHero = ({
  eyebrow,
  title,
  description,
  aside,
  children,
  className = '',
  innerClassName = '',
}) => (
  <section className={`${workspacePageShellClass} ${className}`.trim()}>
    <div className={`${workspaceShellClass} ${innerClassName}`.trim()}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className={workspaceEyebrowClass}>{eyebrow}</p> : null}
          {title ? <h1 className={workspaceTitleClass}>{title}</h1> : null}
          {description ? <p className={workspaceSectionDescriptionClass}>{description}</p> : null}
        </div>
        {aside ? <div className="w-full lg:w-auto lg:max-w-[28rem] lg:shrink-0">{aside}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  </section>
);

export default AccountWorkspaceHero;
