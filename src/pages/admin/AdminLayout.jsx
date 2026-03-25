import React from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from '../../components/admin/AdminSidebar';

export default function AdminLayout() {
  return (
    <div className="admin-layout flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}