import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from '@/app/App'
import { AuthProvider } from '@/app/auth'
import { DialogProvider } from '@/components/ui/Modal'
import { ToastProvider } from '@/components/ui/Toast'
import '@/styles/index.css'

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

/** HashRouter → works on GitHub Pages sub-paths without server rewrites (no 404 on refresh). */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            <HashRouter>
              <App />
            </HashRouter>
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
