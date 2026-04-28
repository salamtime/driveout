import React from 'react';

const AdminModuleHero = ({
  icon,
  eyebrow,
  title,
  description,
  actions = null,
  className = '',
  iconContainerClassName = '',
}) => {
  return (
    <div className={className}>
      <div className="px-4 pt-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-3">
              {icon ? (
                <div className={`rounded-[1.35rem] border border-violet-100 bg-violet-50/70 p-3 shadow-[0_12px_30px_rgba(79,70,229,0.08)] ${iconContainerClassName}`}>
                  {icon}
                </div>
              ) : null}
              <div>
                {eyebrow ? (
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                    {eyebrow}
                  </p>
                ) : null}
                <h1 className="mt-2 text-[2rem] font-bold tracking-[-0.03em] text-slate-950 sm:text-[2.5rem]">
                  {title}
                </h1>
                {description ? (
                  <p className="mt-2 text-sm text-slate-500 sm:text-base">{description}</p>
                ) : null}
              </div>
            </div>

            {actions ? (
              <div className="flex flex-wrap items-center gap-3">
                {actions}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminModuleHero;
