import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Moon, Sun, Monitor } from 'lucide-react'

export function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun, description: 'Light theme' },
    { value: 'dark', label: 'Dark', icon: Moon, description: 'Dark theme' },
    { value: 'system', label: 'System', icon: Monitor, description: 'Follow system preference' },
  ]

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">
            Manage your account settings and preferences.
          </p>
        </div>

        {/* Theme Settings */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Appearance</h2>
            <p className="text-sm text-muted-foreground">
              Choose your preferred theme. Current: {resolvedTheme}
            </p>
          </div>

          <div className="grid gap-3">
            {themeOptions.map((option) => {
              const Icon = option.icon
              return (
                <Button
                  key={option.value}
                  variant={theme === option.value ? 'default' : 'outline'}
                  className="justify-start h-auto p-4"
                  onClick={() => setTheme(option.value as 'light' | 'dark' | 'system')}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">{option.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {option.description}
                      </div>
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>
        </div>

        {/* Brand Information */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Brand</h2>
            <p className="text-sm text-muted-foreground">
              CEERION Mail automatically adapts logo appearance based on your theme choice.
            </p>
          </div>

          <div className="p-4 border border-border rounded-xl bg-muted/30">
            <div className="space-y-2">
              <p className="text-sm">
                <strong>Current theme:</strong> {theme} (resolved: {resolvedTheme})
              </p>
              <p className="text-sm">
                <strong>Logo variant:</strong> {resolvedTheme === 'dark' ? 'light' : 'dark'}
              </p>
              <p className="text-sm text-muted-foreground">
                Brand assets are loaded from <code className="bg-muted px-1 rounded">/brand/ceerion/</code>
              </p>
            </div>
          </div>
        </div>

        {/* Additional Settings Placeholder */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Account</h2>
            <p className="text-sm text-muted-foreground">
              Account settings coming soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
