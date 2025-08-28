import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  Mail, 
  Calendar, 
  MessageSquare, 
  Settings, 
  User, 
  Moon, 
  Sun, 
  Menu,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/theme-provider'
import { cn } from '@/lib/utils'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const location = useLocation()

  const navigation = [
    { name: 'Mail', href: '/mail', icon: Mail },
    { name: 'Calendar', href: '/calendar', icon: Calendar },
    { name: 'Chat', href: '/chat', icon: MessageSquare },
    { name: 'Settings', href: '/settings', icon: Settings },
  ]

  const isCurrentPage = (href: string) => {
    return location.pathname.startsWith(href)
  }

  return (
    <>
      {/* Header */}
      <header className="app-header flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-xl text-primary-foreground font-bold text-sm">
              C
            </div>
            <div>
              <h1 className="font-semibold text-lg">CEERION</h1>
              <p className="text-xs text-muted-foreground">mail.ceerion.com</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          
          <Button variant="ghost" size="icon-sm">
            <User className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        'app-sidebar',
        sidebarOpen && 'open'
      )}>
        <nav className="flex flex-col h-full p-4">
          <div className="space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                    isCurrentPage(item.href)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              )
            })}
          </div>
        </nav>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </>
  )
}
