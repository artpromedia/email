import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface NotificationPermission {
  granted: boolean
  denied: boolean
  requested: boolean
}

export function useNotifications() {
  const { isAuthenticated } = useAuth()
  const [permission, setPermission] = useState<NotificationPermission>({
    granted: false,
    denied: false,
    requested: false
  })

  useEffect(() => {
    if (!('Notification' in window)) {
      return
    }

    const currentPermission = Notification.permission
    setPermission({
      granted: currentPermission === 'granted',
      denied: currentPermission === 'denied',
      requested: currentPermission !== 'default'
    })
  }, [])

  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported')
      return false
    }

    if (Notification.permission === 'granted') {
      return true
    }

    try {
      const result = await Notification.requestPermission()
      const granted = result === 'granted'
      
      setPermission({
        granted,
        denied: result === 'denied',
        requested: true
      })
      
      return granted
    } catch (error) {
      console.error('Failed to request notification permission:', error)
      return false
    }
  }

  const showNotification = (title: string, options?: NotificationOptions & { 
    onClick?: () => void 
  }) => {
    if (!permission.granted || !isAuthenticated) {
      return null
    }

    const { onClick, ...notificationOptions } = options || {}
    
    const notification = new Notification(title, {
      icon: '/brand/ceerion/mark-light.svg',
      badge: '/brand/ceerion/mark-light.svg',
      tag: 'ceerion-mail',
      requireInteraction: false,
      silent: false,
      ...notificationOptions
    })

    if (onClick) {
      notification.onclick = () => {
        window.focus()
        onClick()
        notification.close()
      }
    }

    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close()
    }, 5000)

    return notification
  }

  const showNewMailNotification = (from: string, subject: string, preview: string) => {
    return showNotification('New Mail', {
      body: `From: ${from}\n${subject}\n\n${preview}`,
      onClick: () => {
        // Navigate to inbox
        window.location.href = '/mail'
      }
    })
  }

  return {
    permission,
    requestPermission,
    showNotification,
    showNewMailNotification,
    isSupported: 'Notification' in window
  }
}
