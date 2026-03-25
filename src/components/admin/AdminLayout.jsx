import React from 'react';
import AdminSidebar from './AdminSidebar';

const AdminLayout = ({ children }) => {
  return (
    <div className="flex h-screen">
      <AdminSidebar />
      <main className="flex-1 p-6 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;