import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Plus, Search, Edit, Trash2, UserCheck, UserX } from 'lucide-react'
import { useAdminAuth } from '../contexts/AdminAuthContext'

interface User {
  id: string
  email: string
  name: string
  role: 'user' | 'admin' | 'super_admin'
  status: 'active' | 'inactive' | 'suspended'
  quota: number // in GB
  used: number // in GB
  createdAt: string
  lastLogin: string
}

export function UserManagement() {
  const { user: currentUser } = useAdminAuth()
  const [users, setUsers] = useState<User[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Mock data - in real implementation, fetch from API
  useEffect(() => {
    const mockUsers: User[] = [
      {
        id: '1',
        email: 'john.doe@company.com',
        name: 'John Doe',
        role: 'user',
        status: 'active',
        quota: 50,
        used: 12.5,
        createdAt: '2024-01-15',
        lastLogin: '2024-08-28T10:30:00Z'
      },
      {
        id: '2',
        email: 'jane.smith@company.com',
        name: 'Jane Smith',
        role: 'admin',
        status: 'active',
        quota: 100,
        used: 45.2,
        createdAt: '2024-01-10',
        lastLogin: '2024-08-28T09:15:00Z'
      },
      {
        id: '3',
        email: 'bob.wilson@company.com',
        name: 'Bob Wilson',
        role: 'user',
        status: 'suspended',
        quota: 25,
        used: 18.7,
        createdAt: '2024-02-01',
        lastLogin: '2024-08-25T14:22:00Z'
      }
    ]
    
    setTimeout(() => {
      setUsers(mockUsers)
      setIsLoading(false)
    }, 500)
  }, [])

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const createUser = async (userData: Partial<User>) => {
    // Mock user creation
    const newUser: User = {
      id: Date.now().toString(),
      email: userData.email || '',
      name: userData.name || '',
      role: userData.role || 'user',
      status: 'active',
      quota: userData.quota || 25,
      used: 0,
      createdAt: new Date().toISOString().split('T')[0],
      lastLogin: 'Never'
    }
    setUsers(prev => [...prev, newUser])
    setShowCreateForm(false)
  }

  const updateUserStatus = (userId: string, status: User['status']) => {
    setUsers(prev => prev.map(user => 
      user.id === userId ? { ...user, status } : user
    ))
  }

  const deleteUser = (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      setUsers(prev => prev.filter(user => user.id !== userId))
    }
  }

  const resetUserQuota = (userId: string) => {
    setUsers(prev => prev.map(user => 
      user.id === userId ? { ...user, used: 0 } : user
    ))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 mx-auto mb-4"></div>
          <p>Loading users...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600">Manage user accounts, roles, and quotas</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users ({filteredUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">User</th>
                  <th className="text-left p-3">Role</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Quota Usage</th>
                  <th className="text-left p-3">Last Login</th>
                  <th className="text-left p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      <div>
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-gray-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.role === 'super_admin' ? 'bg-purple-100 text-purple-800' :
                        user.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.status === 'active' ? 'bg-green-100 text-green-800' :
                        user.status === 'suspended' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            (user.used / user.quota) > 0.9 ? 'bg-red-500' :
                            (user.used / user.quota) > 0.7 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${Math.min((user.used / user.quota) * 100, 100)}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {user.used}GB / {user.quota}GB
                      </div>
                    </td>
                    <td className="p-3 text-gray-500">
                      {user.lastLogin === 'Never' ? 'Never' : new Date(user.lastLogin).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center space-x-2">
                        <Button size="sm" variant="ghost">
                          <Edit className="h-4 w-4" />
                        </Button>
                        {user.status === 'active' ? (
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => updateUserStatus(user.id, 'suspended')}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => updateUserStatus(user.id, 'active')}
                          >
                            <UserCheck className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => resetUserQuota(user.id)}
                        >
                          Reset Quota
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => deleteUser(user.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create User Form Modal - Simple implementation */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Create New User</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                createUser({
                  name: formData.get('name') as string,
                  email: formData.get('email') as string,
                  role: formData.get('role') as User['role'],
                  quota: parseInt(formData.get('quota') as string)
                })
              }} className="space-y-4">
                <Input name="name" placeholder="Full name" required />
                <Input name="email" type="email" placeholder="Email address" required />
                <select name="role" className="w-full p-2 border rounded" required>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  {currentUser?.role === 'super_admin' && (
                    <option value="super_admin">Super Admin</option>
                  )}
                </select>
                <Input name="quota" type="number" placeholder="Quota (GB)" defaultValue="25" required />
                <div className="flex space-x-2">
                  <Button type="submit" className="flex-1">Create</Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
