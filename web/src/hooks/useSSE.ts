import { useEffect, useRef } from 'react'

interface UseSSEOptions {
  onMessage?: (event: MessageEvent) => void
  onError?: (event: Event) => void
  onOpen?: (event: Event) => void
}

export function useSSE(url: string, options: UseSSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      options.onMessage?.(event)
    }

    eventSource.onerror = (event) => {
      options.onError?.(event)
    }

    eventSource.onopen = (event) => {
      options.onOpen?.(event)
    }

    return () => {
      eventSource.close()
    }
  }, [url])

  return eventSourceRef.current
}
