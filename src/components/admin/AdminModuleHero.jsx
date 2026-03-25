import React from 'react';

const AdminModuleHero = ({
  icon,
  eyebrow,
  title,
  description,
  actions = null,
  className = '',
}) => {
  return (
    <div className={`bg-gradient-to-r from-violet-700 via-violet-800 to-indigo-900 shadow-xl ${className}`}>
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="border-b border-violet-500/20 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              {icon ? (
                <div className="rounded-lg bg-white/10 p-2 backdrop-blur-sm">
                  {icon}
                </div>
              ) : null}
              <div>
                {eyebrow ? (
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-200">
                    {eyebrow}
                  </p>
                ) : null}
                <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
                {description ? (
                  <p className="mt-1 text-sm text-violet-200 sm:text-base">{description}</p>
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
