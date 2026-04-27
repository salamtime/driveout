import React from 'react';

const AdminMobileStatsRow = ({
  children,
  className = '',
  contentClassName = 'flex gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4',
  itemClassName = 'min-w-[220px] flex-none sm:min-w-0 sm:flex-auto',
}) => {
  return (
    <section className={className}>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div className={contentClassName}>
          {React.Children.map(children, (child, index) => (
            <div key={index} className={itemClassName}>
              {child}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AdminMobileStatsRow;
