import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Button } from '../../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { User } from '../types';

interface UserListProps {
  users: User[];
  onEdit: (user: User) => void;
  onPermissions: (user: User) => void;
  onDelete: (userId: string) => void;
}

const UserList = ({ users, onEdit, onPermissions, onDelete }: UserListProps) => {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length > 0 ? users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.full_name || 'N/A'}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell className="capitalize">{user.role}</TableCell>
              <TableCell>{`${user.allowed_modules_count ?? 0} / 14 modules`}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(user)}>Edit User</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onPermissions(user)}>Edit Permissions</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(user.id)} className="text-red-500 focus:text-red-500">Delete User</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                No results found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default UserList;
