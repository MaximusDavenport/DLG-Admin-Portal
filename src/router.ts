// Simple client-side router for DLG Admin Portal
export class Router {
  private routes: { [key: string]: () => void } = {}
  private currentPath: string = '/'
  
  constructor() {
    // Listen for browser back/forward
    window.addEventListener('popstate', () => {
      this.handleRoute()
    })
    
    // Handle initial load
    this.handleRoute()
  }
  
  register(path: string, handler: () => void) {
    this.routes[path] = handler
  }
  
  navigate(path: string) {
    this.currentPath = path
    history.pushState({}, '', path)
    this.handleRoute()
  }
  
  private handleRoute() {
    const path = window.location.pathname
    const handler = this.routes[path] || this.routes['/']
    
    if (handler) {
      handler()
    }
  }
  
  getCurrentPath(): string {
    return window.location.pathname
  }
}

export const router = new Router()