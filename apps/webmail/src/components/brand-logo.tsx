import { useState, useEffect } from 'react'
import { useTheme } from './theme-provider'

interface BrandLogoProps {
  className?: string
  showSubtitle?: boolean
  variant?: 'logo' | 'mark'
}

export function BrandLogo({ className = '', showSubtitle = true, variant = 'logo' }: BrandLogoProps) {
  const { resolvedTheme } = useTheme()
  const [logoError, setLogoError] = useState(false)
  const [logoSrc, setLogoSrc] = useState<string>('')

  useEffect(() => {
    // Reset error state when theme changes
    setLogoError(false)
    
    // Determine which logo to use based on theme
    const themeVariant = resolvedTheme === 'dark' ? 'light' : 'dark'
    const newLogoSrc = `/brand/ceerion/${variant}-${themeVariant}.svg`
    
    setLogoSrc(newLogoSrc)
  }, [resolvedTheme, variant])

  const handleImageError = () => {
    setLogoError(true)
  }

  if (logoError || !logoSrc) {
    // Fallback to text logo
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">CEERION</span>
          {showSubtitle && (
            <span className="text-sm text-muted-foreground hidden sm:inline">
              mail.ceerion.com
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={logoSrc}
        alt="CEERION"
        className={variant === 'logo' ? 'h-8' : 'h-8 w-8'}
        onError={handleImageError}
        style={{ height: variant === 'logo' ? '28px' : '28px', width: variant === 'mark' ? '28px' : 'auto' }}
      />
      {showSubtitle && variant === 'logo' && (
        <span className="text-sm text-muted-foreground hidden sm:inline">
          mail.ceerion.com
        </span>
      )}
    </div>
  )
}
