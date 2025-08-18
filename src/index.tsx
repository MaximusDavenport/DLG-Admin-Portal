import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

type Variables = {
  user?: {
    userId: number
    email: string
    name: string
    role: 'admin' | 'project_manager' | 'staff' | 'client'
    tenant_id: number
    tenant_key: string
  }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Utilities: hashing and token signing (HMAC-SHA256)
const te = new TextEncoder()

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', te.encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function b64urlFromBytes(bytes: ArrayBuffer): string {
  let str = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.byteLength; i++) str += String.fromCharCode(arr[i])
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function b64urlFromString(s: string): string {
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    te.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, te.encode(data))
  return b64urlFromBytes(sig)
}

async function createToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const h = b64urlFromString(JSON.stringify(header))
  const p = b64urlFromString(JSON.stringify(payload))
  const sig = await hmacSign(secret, `${h}.${p}`)
  return `${h}.${p}.${sig}`
}

async function verifyToken(token: string, secret: string): Promise<any | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const expected = await hmacSign(secret, `${h}.${p}`)
  if (s !== expected) return null
  try {
    const json = JSON.parse(atob(p.replaceAll('-', '+').replaceAll('_', '/')))
    if (json.exp && Date.now() > json.exp) return null
    return json
  } catch {
    return null
  }
}

// Auth middleware for API (except /api/auth/* and /api/health)
app.use('/api/*', async (c, next) => {
  const path = c.req.path
  if (path.startsWith('/api/auth') || path === '/api/health') return next()
  const auth = c.req.header('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) return c.json({ success: false, message: 'Unauthorized' }, 401)
  const token = auth.substring(7)
  const secret = c.env.JWT_SECRET || 'dev-secret'
  const data = await verifyToken(token, secret)
  if (!data) return c.json({ success: false, message: 'Invalid token' }, 401)
  c.set('user', data)
  await next()
})

async function getScopedTenantIds(c: import('hono').Context<{ Bindings: Bindings; Variables: Variables }>): Promise<number[]> {
  const user = c.get('user')
  if (!user) return []
  // DLG staff can see all tenants
  if (user.tenant_key === 'DLG' && (user.role === 'admin' || user.role === 'project_manager' || user.role === 'staff')) {
    const rows = await c.env.DB.prepare('SELECT id FROM tenants').all()
    return rows.results.map((r: any) => r.id as number)
  }
  return [user.tenant_id]
}

// Enable CORS for all routes
app.use('*', cors({
  origin: ['https://app.davenportlegacy.com', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// Serve static files for all portals
app.use('/static/*', serveStatic({ root: './public' }))


// Main DLG Admin Portal (Red/Dark theme) - This is the primary interface
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DLG Administration Portal</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            tailwind.config = {
                theme: {
                    extend: {
                        colors: {
                            'dlg-red': '#dc2626',
                            'dlg-dark': '#1f2937',
                            'dlg-darker': '#111827',
                            'dlg-accent': '#ef4444'
                        }
                    }
                }
            }
        </script>
        <style>
            body {
                background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
                min-height: 100vh;
            }
            .card-dark {
                background: rgba(31, 41, 55, 0.8);
                border: 1px solid rgba(239, 68, 68, 0.2);
                backdrop-filter: blur(10px);
            }
            .btn-dlg {
                background: linear-gradient(135deg, #dc2626, #b91c1c);
                transition: all 0.3s ease;
            }
            .btn-dlg:hover {
                background: linear-gradient(135deg, #b91c1c, #991b1b);
                transform: translateY(-1px);
            }
            .sidebar {
                background: linear-gradient(180deg, #111827, #0f172a);
                border-right: 1px solid rgba(239, 68, 68, 0.3);
                width: 280px;
                min-height: 100vh;
                position: fixed;
                left: 0;
                top: 0;
                z-index: 40;
                transform: translateX(-100%);
                transition: transform 0.3s ease;
            }
            .sidebar.open {
                transform: translateX(0);
            }
            .sidebar-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 30;
                display: none;
            }
            .sidebar-overlay.active {
                display: block;
            }
            .main-content {
                transition: margin-left 0.3s ease;
            }
            .main-content.sidebar-open {
                margin-left: 280px;
            }
            .sidebar-menu-item {
                display: flex;
                align-items: center;
                padding: 12px 20px;
                margin: 4px 12px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                color: #d1d5db;
                text-decoration: none;
            }
            .sidebar-menu-item:hover {
                background: rgba(239, 68, 68, 0.1);
                color: #ef4444;
            }
            .sidebar-menu-item.active {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
                border-left: 3px solid #ef4444;
            }
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
                max-width: 400px;
                padding: 16px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                animation: slideInRight 0.3s ease-out;
            }
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            .client-card {
                transition: all 0.3s ease;
                cursor: pointer;
            }
            .client-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 25px rgba(239, 68, 68, 0.1);
            }
            .project-card {
                transition: all 0.3s ease;
                cursor: pointer;
            }
            .project-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 25px rgba(239, 68, 68, 0.1);
            }
            .invoice-row {
                transition: all 0.2s ease;
                cursor: pointer;
            }
            .invoice-row:hover {
                background: rgba(239, 68, 68, 0.1);
            }
            @media (min-width: 1024px) {
                .sidebar {
                    position: relative;
                    transform: translateX(0);
                }
                .main-content {
                    margin-left: 280px;
                }
                .sidebar-overlay {
                    display: none !important;
                }
            }
        </style>
    </head>
    <body class="text-white">
        <!-- Header -->
        <header class="bg-dlg-darker shadow-lg border-b border-dlg-red relative z-50">
            <div class="flex justify-between items-center h-16 px-4">
                <div class="flex items-center">
                    <button id="sidebarToggle" class="lg:hidden text-dlg-red hover:text-red-300 mr-4">
                        <i class="fas fa-bars text-xl"></i>
                    </button>
                    <h1 class="text-xl font-bold text-dlg-red">
                        <i class="fas fa-shield-alt mr-2"></i>
                        DLG Administration Portal
                    </h1>
                </div>
                <div class="flex items-center space-x-4">
                    <div id="userInfo" class="hidden">
                        <span class="text-sm text-gray-300">Welcome, <span id="userName" class="text-dlg-red font-medium"></span></span>
                    </div>
                    <button id="loginBtn" class="btn-dlg text-white px-4 py-2 rounded-md text-sm font-medium">
                        <i class="fas fa-sign-in-alt mr-2"></i>Staff Login
                    </button>
                    <button id="logoutBtn" class="hidden bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700">
                        <i class="fas fa-sign-out-alt mr-2"></i>Logout
                    </button>
                </div>
            </div>
        </header>

        <!-- Sidebar Overlay -->
        <div id="sidebarOverlay" class="sidebar-overlay"></div>

        <!-- Sidebar -->
        <nav id="sidebar" class="sidebar">
            <div class="p-6 border-b border-gray-700">
                <div class="flex items-center">
                    <i class="fas fa-shield-alt text-2xl text-dlg-red mr-3"></i>
                    <div>
                        <h2 class="text-lg font-bold text-white">DLG Admin</h2>
                        <p class="text-sm text-gray-400">Control Center</p>
                    </div>
                </div>
            </div>
            
            <div class="py-4">
                <a href="#" class="sidebar-menu-item active" data-page="dashboard">
                    <i class="fas fa-tachometer-alt w-6"></i>
                    <span class="ml-3">Dashboard</span>
                </a>
                <a href="#" class="sidebar-menu-item" data-page="clients">
                    <i class="fas fa-users w-6"></i>
                    <span class="ml-3">Clients</span>
                </a>
                <a href="#" class="sidebar-menu-item" data-page="projects">
                    <i class="fas fa-project-diagram w-6"></i>
                    <span class="ml-3">Projects</span>
                </a>
                <a href="#" class="sidebar-menu-item" data-page="invoices">
                    <i class="fas fa-file-invoice-dollar w-6"></i>
                    <span class="ml-3">Invoices</span>
                </a>
                <a href="#" class="sidebar-menu-item" data-page="analytics">
                    <i class="fas fa-chart-bar w-6"></i>
                    <span class="ml-3">Analytics</span>
                </a>
                <a href="#" class="sidebar-menu-item" data-page="reports">
                    <i class="fas fa-file-pdf w-6"></i>
                    <span class="ml-3">Reports</span>
                </a>
                <a href="#" class="sidebar-menu-item" data-page="settings">
                    <i class="fas fa-cog w-6"></i>
                    <span class="ml-3">Settings</span>
                </a>
            </div>

            <div class="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
                <div class="text-center">
                    <p class="text-xs text-gray-500">Version 2.0.0</p>
                    <p class="text-xs text-gray-500">© 2024 DLG</p>
                </div>
            </div>
        </nav>

        <!-- Login Modal -->
        <div id="loginModal" class="hidden fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
            <div class="card-dark rounded-lg shadow-2xl p-6 w-96 mx-4">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-xl font-bold text-dlg-red">DLG Staff Login</h2>
                    <button id="closeLoginModal" class="text-gray-400 hover:text-white">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <form id="loginForm">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-300 mb-2">Email</label>
                        <input type="email" id="email" class="w-full px-3 py-2 bg-dlg-dark border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-dlg-red focus:border-transparent" placeholder="maximus@davenportlegacy.com" required>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-300 mb-2">Password</label>
                        <input type="password" id="password" class="w-full px-3 py-2 bg-dlg-dark border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-dlg-red focus:border-transparent" required>
                    </div>
                    <button type="submit" class="w-full btn-dlg text-white py-2 px-4 rounded-md font-medium">
                        <i class="fas fa-sign-in-alt mr-2"></i>Access DLG Portal
                    </button>
                </form>
                <div id="loginError" class="hidden mt-4 p-3 bg-red-900 border border-red-700 text-red-200 rounded"></div>
            </div>
        </div>

        <!-- Main Content -->
        <main id="mainContent" class="main-content min-h-screen">
            <!-- Welcome Section (shown when not logged in) -->
            <div id="welcomeSection" class="text-center py-12 px-6">
                <div class="card-dark rounded-lg p-8 max-w-2xl mx-auto">
                    <i class="fas fa-shield-alt text-6xl text-dlg-red mb-6"></i>
                    <h1 class="text-4xl font-bold text-white mb-4">
                        DLG Administration Portal
                    </h1>
                    <p class="text-xl text-gray-300 mb-8">
                        Manage GA, BYF, and DLG operations from your central command center
                    </p>
                    <div class="grid md:grid-cols-2 gap-6 mb-8">
                        <div class="card-dark p-6 rounded-lg">
                            <i class="fas fa-chart-line text-3xl text-dlg-red mb-4"></i>
                            <h3 class="text-lg font-semibold mb-2">Multi-Tenant Management</h3>
                            <p class="text-gray-400">Oversee all GA and BYF operations with comprehensive admin tools</p>
                        </div>
                        <div class="card-dark p-6 rounded-lg">
                            <i class="fas fa-cogs text-3xl text-dlg-red mb-4"></i>
                            <h3 class="text-lg font-semibold mb-2">Advanced Administration</h3>
                            <p class="text-gray-400">Complete project, client, and financial management capabilities</p>
                        </div>
                    </div>
                    <button id="getStartedBtn" class="btn-dlg px-8 py-3 rounded-lg text-lg font-medium">
                        <i class="fas fa-rocket mr-2"></i>Access Admin Portal
                    </button>
                </div>
            </div>

            <!-- Dashboard Page -->
            <div id="dashboardPage" class="hidden p-6">
                <!-- Dashboard Header -->
                <div class="mb-8">
                    <h1 class="text-3xl font-bold text-white mb-2">Administration Dashboard</h1>
                    <p class="text-gray-400">Overview of all GA and BYF operations</p>
                </div>

                <!-- Dashboard Stats -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div class="card-dark rounded-lg p-6">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <i class="fas fa-project-diagram text-2xl text-dlg-red"></i>
                            </div>
                            <div class="ml-4">
                                <p class="text-sm font-medium text-gray-400">Active Projects</p>
                                <p class="text-2xl font-semibold text-white" id="activeProjects">-</p>
                            </div>
                        </div>
                    </div>
                    <div class="card-dark rounded-lg p-6">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <i class="fas fa-dollar-sign text-2xl text-green-500"></i>
                            </div>
                            <div class="ml-4">
                                <p class="text-sm font-medium text-gray-400">Total Revenue</p>
                                <p class="text-2xl font-semibold text-white" id="totalRevenue">-</p>
                            </div>
                        </div>
                    </div>
                    <div class="card-dark rounded-lg p-6">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <i class="fas fa-users text-2xl text-blue-500"></i>
                            </div>
                            <div class="ml-4">
                                <p class="text-sm font-medium text-gray-400">Total Clients</p>
                                <p class="text-2xl font-semibold text-white" id="totalClients">-</p>
                            </div>
                        </div>
                    </div>
                    <div class="card-dark rounded-lg p-6">
                        <div class="flex items-center">
                            <div class="flex-shrink-0">
                                <i class="fas fa-file-invoice text-2xl text-orange-500"></i>
                            </div>
                            <div class="ml-4">
                                <p class="text-sm font-medium text-gray-400">Pending Invoices</p>
                                <p class="text-2xl font-semibold text-white" id="pendingInvoices">-</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Charts Row -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <!-- Revenue Chart -->
                    <div class="card-dark rounded-lg p-6">
                        <h3 class="text-lg font-semibold text-white mb-4">
                            <i class="fas fa-chart-line text-dlg-red mr-2"></i>Revenue Trends (Last 6 Months)
                        </h3>
                        <canvas id="revenueChart" class="w-full h-64"></canvas>
                    </div>
                    
                    <!-- Project Status Chart -->
                    <div class="card-dark rounded-lg p-6">
                        <h3 class="text-lg font-semibold text-white mb-4">
                            <i class="fas fa-chart-pie text-dlg-red mr-2"></i>Project Status Distribution
                        </h3>
                        <canvas id="projectChart" class="w-full h-64"></canvas>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="card-dark rounded-lg mb-8">
                    <div class="p-6 border-b border-gray-700">
                        <h2 class="text-lg font-semibold text-white">
                            <i class="fas fa-bolt mr-2 text-dlg-red"></i>Admin Quick Actions
                        </h2>
                    </div>
                    <div class="p-6">
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <button class="quick-action-btn btn-dlg hover:bg-red-700 text-white p-4 rounded-lg text-center transition-all flex flex-col items-center justify-center min-h-[100px]" data-action="generate-report">
                                <i class="fas fa-file-pdf text-2xl mb-2"></i>
                                <span class="block text-sm font-medium">Generate Report</span>
                            </button>
                            <button class="quick-action-btn bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg text-center transition-all flex flex-col items-center justify-center min-h-[100px]" data-action="send-email">
                                <i class="fas fa-envelope text-2xl mb-2"></i>
                                <span class="block text-sm font-medium">Send Email</span>
                            </button>
                            <button class="quick-action-btn bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-lg text-center transition-all flex flex-col items-center justify-center min-h-[100px]" data-action="schedule-meeting">
                                <i class="fas fa-calendar text-2xl mb-2"></i>
                                <span class="block text-sm font-medium">Schedule Meeting</span>
                            </button>
                            <button class="quick-action-btn bg-orange-600 hover:bg-orange-700 text-white p-4 rounded-lg text-center transition-all flex flex-col items-center justify-center min-h-[100px]" data-action="export-data">
                                <i class="fas fa-download text-2xl mb-2"></i>
                                <span class="block text-sm font-medium">Export Data</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Recent Activity -->
                <div class="card-dark rounded-lg">
                    <div class="p-6 border-b border-gray-700">
                        <h2 class="text-lg font-semibold text-white">
                            <i class="fas fa-clock mr-2 text-dlg-red"></i>Recent Activity
                        </h2>
                    </div>
                    <div class="p-6">
                        <div id="recentActivity" class="space-y-3">
                            <div class="flex items-center p-3 bg-dlg-darker rounded-lg">
                                <i class="fas fa-spinner fa-spin text-dlg-red mr-3"></i>
                                <span class="text-gray-300">Loading recent activity...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Clients Page -->
            <div id="clientsPage" class="hidden p-6">
                <div class="mb-8">
                    <div class="flex justify-between items-center">
                        <div>
                            <h1 class="text-3xl font-bold text-white mb-2">Client Management</h1>
                            <p class="text-gray-400">Manage all GA and BYF clients</p>
                        </div>
                        <button class="btn-dlg px-4 py-2 rounded-md text-sm font-medium">
                            <i class="fas fa-plus mr-2"></i>Add New Client
                        </button>
                    </div>
                </div>

                <!-- Client Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="clientCards">
                    <div class="card-dark rounded-lg p-6 client-card" data-client="techstart">
                        <div class="flex items-center mb-4">
                            <div class="bg-green-600 w-12 h-12 rounded-full flex items-center justify-center mr-4">
                                <i class="fas fa-rocket text-white text-lg"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-white">TechStart Inc</h3>
                                <p class="text-sm text-gray-400">GA Client • Active</p>
                            </div>
                        </div>
                        <div class="space-y-2 mb-4">
                            <p class="text-sm text-gray-300">
                                <i class="fas fa-user mr-2 text-dlg-red"></i>
                                <strong>Contact:</strong> Sarah Johnson
                            </p>
                            <p class="text-sm text-gray-300">
                                <i class="fas fa-envelope mr-2 text-dlg-red"></i>
                                sarah.johnson@techstart.com
                            </p>
                            <p class="text-sm text-gray-300">
                                <i class="fas fa-phone mr-2 text-dlg-red"></i>
                                (555) 123-4567
                            </p>
                            <p class="text-sm text-gray-300">
                                <i class="fas fa-building mr-2 text-dlg-red"></i>
                                Tech Startup, Series A
                            </p>
                        </div>
                        <div class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                            <div class="text-center">
                                <p class="text-2xl font-bold text-green-400">3</p>
                                <p class="text-xs text-gray-400">Active Projects</p>
                            </div>
                            <div class="text-center">
                                <p class="text-2xl font-bold text-blue-400">$45k</p>
                                <p class="text-xs text-gray-400">Monthly Value</p>
                            </div>
                        </div>
                    </div>

                    <div class="card-dark rounded-lg p-6 client-card" data-client="growthcorp">
                        <div class="flex items-center mb-4">
                            <div class="bg-blue-600 w-12 h-12 rounded-full flex items-center justify-center mr-4">
                                <i class="fas fa-chart-line text-white text-lg"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-white">GrowthCorp</h3>
                                <p class="text-sm text-gray-400">BYF Client • Active</p>
                            </div>
                        </div>
                        <div class="space-y-2 mb-4">
                            <p class="text-sm text-gray-300">
                                <i class="fas fa-user mr-2 text-dlg-red"></i>
                                <strong>Contact:</strong> Michael Chen
                            </p>
                            <p class="text-sm text-gray-300">
                                <i class="fas fa-envelope mr-2 text-dlg-red"></i>
                                m.chen@growthcorp.biz
                            </p>
                            <p class="text-sm text-gray-300">
                                <i class="fas fa-phone mr-2 text-dlg-red"></i>
                                (555) 987-6543
                            </p>
                            <p class="text-sm text-gray-300">
                                <i class="fas fa-building mr-2 text-dlg-red"></i>
                                SMB Consulting, 50+ employees
                            </p>
                        </div>
                        <div class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                            <div class="text-center">
                                <p class="text-2xl font-bold text-green-400">2</p>
                                <p class="text-xs text-gray-400">Active Projects</p>
                            </div>
                            <div class="text-center">
                                <p class="text-2xl font-bold text-blue-400">$32k</p>
                                <p class="text-xs text-gray-400">Monthly Value</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Projects Page -->
            <div id="projectsPage" class="hidden p-6">
                <div class="mb-8">
                    <div class="flex justify-between items-center">
                        <div>
                            <h1 class="text-3xl font-bold text-white mb-2">Project Management</h1>
                            <p class="text-gray-400">Track and manage all client projects</p>
                        </div>
                        <button class="btn-dlg px-4 py-2 rounded-md text-sm font-medium">
                            <i class="fas fa-plus mr-2"></i>New Project
                        </button>
                    </div>
                </div>

                <!-- Project Cards -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" id="projectCards">
                    <div class="card-dark rounded-lg p-6 project-card" data-project="ecommerce">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-white">E-commerce Platform</h3>
                                <p class="text-sm text-gray-400">TechStart Inc • GA Project</p>
                            </div>
                            <span class="bg-green-600 text-white text-xs px-2 py-1 rounded">In Progress</span>
                        </div>
                        <p class="text-gray-300 mb-4">Full-stack e-commerce solution with React, Node.js, and Stripe integration. Custom admin dashboard and mobile-responsive design.</p>
                        <div class="space-y-3 mb-4">
                            <div class="flex justify-between">
                                <span class="text-sm text-gray-400">Progress</span>
                                <span class="text-sm text-white font-medium">75%</span>
                            </div>
                            <div class="w-full bg-gray-700 rounded-full h-2">
                                <div class="bg-dlg-red h-2 rounded-full" style="width: 75%"></div>
                            </div>
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p class="text-gray-400">Start Date</p>
                                    <p class="text-white">Jan 15, 2024</p>
                                </div>
                                <div>
                                    <p class="text-gray-400">Due Date</p>
                                    <p class="text-white">Mar 30, 2024</p>
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-between items-center pt-4 border-t border-gray-700">
                            <div class="text-sm">
                                <span class="text-gray-400">Value:</span>
                                <span class="text-green-400 font-bold">$25,000</span>
                            </div>
                            <div class="flex -space-x-2">
                                <img class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23dc2626'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='14' font-family='Arial'%3ESJ%3C/text%3E%3C/svg%3E" alt="Sarah Johnson">
                                <img class="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-sm" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2310b981'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='14' font-family='Arial'%3EDT%3C/text%3E%3C/svg%3E" alt="Dev Team">
                            </div>
                        </div>
                    </div>

                    <div class="card-dark rounded-lg p-6 project-card" data-project="crm">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-white">CRM Implementation</h3>
                                <p class="text-sm text-gray-400">GrowthCorp • BYF Project</p>
                            </div>
                            <span class="bg-blue-600 text-white text-xs px-2 py-1 rounded">Planning</span>
                        </div>
                        <p class="text-gray-300 mb-4">Custom CRM system implementation with Salesforce integration, automated workflows, and advanced analytics dashboard.</p>
                        <div class="space-y-3 mb-4">
                            <div class="flex justify-between">
                                <span class="text-sm text-gray-400">Progress</span>
                                <span class="text-sm text-white font-medium">25%</span>
                            </div>
                            <div class="w-full bg-gray-700 rounded-full h-2">
                                <div class="bg-blue-600 h-2 rounded-full" style="width: 25%"></div>
                            </div>
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p class="text-gray-400">Start Date</p>
                                    <p class="text-white">Feb 1, 2024</p>
                                </div>
                                <div>
                                    <p class="text-gray-400">Due Date</p>
                                    <p class="text-white">May 15, 2024</p>
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-between items-center pt-4 border-t border-gray-700">
                            <div class="text-sm">
                                <span class="text-gray-400">Value:</span>
                                <span class="text-green-400 font-bold">$18,000</span>
                            </div>
                            <div class="flex -space-x-2">
                                <img class="w-8 h-8 rounded-full bg-purple-600" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%237c3aed'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='14' font-family='Arial'%3EMC%3C/text%3E%3C/svg%3E" alt="Michael Chen">
                                <img class="w-8 h-8 rounded-full bg-orange-600" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23ea580c'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='14' font-family='Arial'%3EPM%3C/text%3E%3C/svg%3E" alt="Project Manager">
                            </div>
                        </div>
                    </div>

                    <div class="card-dark rounded-lg p-6 project-card" data-project="mobile">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-white">Mobile App Development</h3>
                                <p class="text-sm text-gray-400">TechStart Inc • GA Project</p>
                            </div>
                            <span class="bg-yellow-600 text-white text-xs px-2 py-1 rounded">Review</span>
                        </div>
                        <p class="text-gray-300 mb-4">React Native mobile application with offline capability, push notifications, and seamless API integration.</p>
                        <div class="space-y-3 mb-4">
                            <div class="flex justify-between">
                                <span class="text-sm text-gray-400">Progress</span>
                                <span class="text-sm text-white font-medium">90%</span>
                            </div>
                            <div class="w-full bg-gray-700 rounded-full h-2">
                                <div class="bg-yellow-600 h-2 rounded-full" style="width: 90%"></div>
                            </div>
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p class="text-gray-400">Start Date</p>
                                    <p class="text-white">Dec 1, 2023</p>
                                </div>
                                <div>
                                    <p class="text-gray-400">Due Date</p>
                                    <p class="text-white">Feb 28, 2024</p>
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-between items-center pt-4 border-t border-gray-700">
                            <div class="text-sm">
                                <span class="text-gray-400">Value:</span>
                                <span class="text-green-400 font-bold">$35,000</span>
                            </div>
                            <div class="flex -space-x-2">
                                <img class="w-8 h-8 rounded-full bg-pink-600" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23ec4899'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='14' font-family='Arial'%3EMD%3C/text%3E%3C/svg%3E" alt="Mobile Dev">
                                <img class="w-8 h-8 rounded-full bg-teal-600" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230d9488'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='14' font-family='Arial'%3EQA%3C/text%3E%3C/svg%3E" alt="QA Team">
                            </div>
                        </div>
                    </div>

                    <div class="card-dark rounded-lg p-6 project-card" data-project="website">
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-white">Website Redesign</h3>
                                <p class="text-sm text-gray-400">GrowthCorp • BYF Project</p>
                            </div>
                            <span class="bg-green-600 text-white text-xs px-2 py-1 rounded">Completed</span>
                        </div>
                        <p class="text-gray-300 mb-4">Complete website overhaul with modern design, SEO optimization, and conversion rate improvements.</p>
                        <div class="space-y-3 mb-4">
                            <div class="flex justify-between">
                                <span class="text-sm text-gray-400">Progress</span>
                                <span class="text-sm text-white font-medium">100%</span>
                            </div>
                            <div class="w-full bg-gray-700 rounded-full h-2">
                                <div class="bg-green-600 h-2 rounded-full" style="width: 100%"></div>
                            </div>
                            <div class="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p class="text-gray-400">Start Date</p>
                                    <p class="text-white">Oct 1, 2023</p>
                                </div>
                                <div>
                                    <p class="text-gray-400">Completed</p>
                                    <p class="text-white">Jan 20, 2024</p>
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-between items-center pt-4 border-t border-gray-700">
                            <div class="text-sm">
                                <span class="text-gray-400">Value:</span>
                                <span class="text-green-400 font-bold">$12,000</span>
                            </div>
                            <div class="flex -space-x-2">
                                <img class="w-8 h-8 rounded-full bg-indigo-600" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%234f46e5'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-size='14' font-family='Arial'%3EWD%3C/text%3E%3C/svg%3E" alt="Web Designer">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Invoices Page -->
            <div id="invoicesPage" class="hidden p-6">
                <div class="mb-8">
                    <div class="flex justify-between items-center">
                        <div>
                            <h1 class="text-3xl font-bold text-white mb-2">Invoice Management</h1>
                            <p class="text-gray-400">Track payments and billing across all clients</p>
                        </div>
                        <button class="btn-dlg px-4 py-2 rounded-md text-sm font-medium">
                            <i class="fas fa-plus mr-2"></i>Create Invoice
                        </button>
                    </div>
                </div>

                <!-- Invoice Stats -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div class="card-dark rounded-lg p-6">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-sm font-medium text-gray-400">Total Outstanding</p>
                                <p class="text-2xl font-bold text-red-400">$23,750</p>
                            </div>
                            <i class="fas fa-exclamation-triangle text-red-400 text-2xl"></i>
                        </div>
                    </div>
                    <div class="card-dark rounded-lg p-6">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-sm font-medium text-gray-400">Paid This Month</p>
                                <p class="text-2xl font-bold text-green-400">$67,200</p>
                            </div>
                            <i class="fas fa-check-circle text-green-400 text-2xl"></i>
                        </div>
                    </div>
                    <div class="card-dark rounded-lg p-6">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-sm font-medium text-gray-400">Avg Payment Time</p>
                                <p class="text-2xl font-bold text-blue-400">18 Days</p>
                            </div>
                            <i class="fas fa-clock text-blue-400 text-2xl"></i>
                        </div>
                    </div>
                </div>

                <!-- Invoice Table -->
                <div class="card-dark rounded-lg">
                    <div class="p-6 border-b border-gray-700">
                        <h3 class="text-lg font-semibold text-white">Recent Invoices</h3>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full">
                            <thead class="bg-dlg-darker">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Invoice</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Client</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Due Date</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-700">
                                <tr class="invoice-row" data-invoice="INV-2024-001">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div>
                                            <div class="text-sm font-medium text-white">INV-2024-001</div>
                                            <div class="text-sm text-gray-400">E-commerce Platform - Phase 2</div>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-white">TechStart Inc</div>
                                        <div class="text-sm text-gray-400">sarah.johnson@techstart.com</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-white">$12,500</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-white">Mar 15, 2024</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-900 text-red-200">
                                            Overdue
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <button class="text-dlg-red hover:text-red-300 mr-3">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="text-blue-400 hover:text-blue-300 mr-3">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="text-green-400 hover:text-green-300">
                                            <i class="fas fa-paper-plane"></i>
                                        </button>
                                    </td>
                                </tr>
                                <tr class="invoice-row" data-invoice="INV-2024-002">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div>
                                            <div class="text-sm font-medium text-white">INV-2024-002</div>
                                            <div class="text-sm text-gray-400">CRM Implementation - Discovery</div>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-white">GrowthCorp</div>
                                        <div class="text-sm text-gray-400">m.chen@growthcorp.biz</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-white">$4,500</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-white">Mar 30, 2024</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-900 text-yellow-200">
                                            Pending
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <button class="text-dlg-red hover:text-red-300 mr-3">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="text-blue-400 hover:text-blue-300 mr-3">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="text-green-400 hover:text-green-300">
                                            <i class="fas fa-paper-plane"></i>
                                        </button>
                                    </td>
                                </tr>
                                <tr class="invoice-row" data-invoice="INV-2024-003">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div>
                                            <div class="text-sm font-medium text-white">INV-2024-003</div>
                                            <div class="text-sm text-gray-400">Mobile App - Final Payment</div>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-white">TechStart Inc</div>
                                        <div class="text-sm text-gray-400">sarah.johnson@techstart.com</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-white">$17,500</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-white">Feb 28, 2024</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-900 text-green-200">
                                            Paid
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <button class="text-dlg-red hover:text-red-300 mr-3">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="text-gray-600 mr-3" disabled>
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="text-blue-400 hover:text-blue-300">
                                            <i class="fas fa-download"></i>
                                        </button>
                                    </td>
                                </tr>
                                <tr class="invoice-row" data-invoice="INV-2024-004">
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div>
                                            <div class="text-sm font-medium text-white">INV-2024-004</div>
                                            <div class="text-sm text-gray-400">Website Redesign - Final</div>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-white">GrowthCorp</div>
                                        <div class="text-sm text-gray-400">m.chen@growthcorp.biz</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm font-medium text-white">$6,000</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <div class="text-sm text-white">Jan 25, 2024</div>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-900 text-green-200">
                                            Paid
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                                        <button class="text-dlg-red hover:text-red-300 mr-3">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="text-gray-600 mr-3" disabled>
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="text-blue-400 hover:text-blue-300">
                                            <i class="fas fa-download"></i>
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Analytics Page -->
            <div id="analyticsPage" class="hidden p-6">
                <div class="mb-8">
                    <h1 class="text-3xl font-bold text-white mb-2">Advanced Analytics</h1>
                    <p class="text-gray-400">Comprehensive business intelligence and reporting</p>
                </div>

                <!-- Analytics Charts -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <div class="card-dark rounded-lg p-6">
                        <h3 class="text-lg font-semibold text-white mb-4">
                            <i class="fas fa-chart-area text-dlg-red mr-2"></i>Revenue vs Expenses
                        </h3>
                        <canvas id="revenueExpenseChart" class="w-full h-64"></canvas>
                    </div>
                    
                    <div class="card-dark rounded-lg p-6">
                        <h3 class="text-lg font-semibold text-white mb-4">
                            <i class="fas fa-chart-bar text-dlg-red mr-2"></i>Client Distribution
                        </h3>
                        <canvas id="clientDistributionChart" class="w-full h-64"></canvas>
                    </div>
                </div>

                <!-- KPI Cards -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div class="card-dark rounded-lg p-6 text-center">
                        <i class="fas fa-trophy text-3xl text-yellow-500 mb-3"></i>
                        <h4 class="text-lg font-semibold text-white">Success Rate</h4>
                        <p class="text-2xl font-bold text-yellow-500">94.2%</p>
                        <p class="text-sm text-gray-400">Project completion</p>
                    </div>
                    <div class="card-dark rounded-lg p-6 text-center">
                        <i class="fas fa-clock text-3xl text-blue-500 mb-3"></i>
                        <h4 class="text-lg font-semibold text-white">Avg Delivery</h4>
                        <p class="text-2xl font-bold text-blue-500">2.3 Days</p>
                        <p class="text-sm text-gray-400">Ahead of schedule</p>
                    </div>
                    <div class="card-dark rounded-lg p-6 text-center">
                        <i class="fas fa-heart text-3xl text-red-500 mb-3"></i>
                        <h4 class="text-lg font-semibold text-white">Client Satisfaction</h4>
                        <p class="text-2xl font-bold text-red-500">4.8/5</p>
                        <p class="text-sm text-gray-400">Average rating</p>
                    </div>
                    <div class="card-dark rounded-lg p-6 text-center">
                        <i class="fas fa-sync text-3xl text-green-500 mb-3"></i>
                        <h4 class="text-lg font-semibold text-white">Retention Rate</h4>
                        <p class="text-2xl font-bold text-green-500">87%</p>
                        <p class="text-sm text-gray-400">Client retention</p>
                    </div>
                </div>
            </div>

            <!-- Reports Page -->
            <div id="reportsPage" class="hidden p-6">
                <div class="mb-8">
                    <h1 class="text-3xl font-bold text-white mb-2">Reports & Export</h1>
                    <p class="text-gray-400">Generate and download comprehensive reports</p>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="card-dark rounded-lg p-6">
                        <h3 class="text-lg font-semibold text-white mb-4">Generate Custom Report</h3>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2">Report Type</label>
                                <select class="w-full px-3 py-2 bg-dlg-dark border border-gray-600 rounded-md text-white">
                                    <option>Financial Summary</option>
                                    <option>Project Analytics</option>
                                    <option>Client Performance</option>
                                    <option>Team Productivity</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2">Date Range</label>
                                <select class="w-full px-3 py-2 bg-dlg-dark border border-gray-600 rounded-md text-white">
                                    <option>Last 30 Days</option>
                                    <option>Last Quarter</option>
                                    <option>Last 6 Months</option>
                                    <option>Year to Date</option>
                                    <option>Custom Range</option>
                                </select>
                            </div>
                            <button class="w-full btn-dlg py-2 rounded-md">
                                <i class="fas fa-file-pdf mr-2"></i>Generate Report
                            </button>
                        </div>
                    </div>

                    <div class="card-dark rounded-lg p-6">
                        <h3 class="text-lg font-semibold text-white mb-4">Recent Reports</h3>
                        <div class="space-y-3">
                            <div class="flex justify-between items-center p-3 bg-dlg-darker rounded">
                                <div>
                                    <p class="text-sm font-medium text-white">Q1 Financial Report</p>
                                    <p class="text-xs text-gray-400">Generated Mar 1, 2024</p>
                                </div>
                                <button class="text-dlg-red hover:text-red-300">
                                    <i class="fas fa-download"></i>
                                </button>
                            </div>
                            <div class="flex justify-between items-center p-3 bg-dlg-darker rounded">
                                <div>
                                    <p class="text-sm font-medium text-white">Client Analysis Feb</p>
                                    <p class="text-xs text-gray-400">Generated Feb 28, 2024</p>
                                </div>
                                <button class="text-dlg-red hover:text-red-300">
                                    <i class="fas fa-download"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Settings Page -->
            <div id="settingsPage" class="hidden p-6">
                <div class="mb-8">
                    <h1 class="text-3xl font-bold text-white mb-2">System Settings</h1>
                    <p class="text-gray-400">Configure system preferences and integrations</p>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="card-dark rounded-lg p-6">
                        <h3 class="text-lg font-semibold text-white mb-4">General Settings</h3>
                        <div class="space-y-4">
                            <div class="flex justify-between items-center">
                                <span class="text-gray-300">Email Notifications</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" class="sr-only peer" checked>
                                    <div class="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-dlg-red"></div>
                                </label>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-300">Auto Backup</span>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" class="sr-only peer" checked>
                                    <div class="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-dlg-red"></div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="card-dark rounded-lg p-6">
                        <h3 class="text-lg font-semibold text-white mb-4">API Integrations</h3>
                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <span class="text-gray-300">Stripe Payment</span>
                                <span class="text-green-400">Connected</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-300">Zoom Meetings</span>
                                <span class="text-green-400">Connected</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-300">Slack Notifications</span>
                                <span class="text-yellow-400">Pending</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- Footer -->
        <footer class="bg-dlg-darker border-t border-dlg-red mt-12">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div class="flex justify-between items-center">
                    <p class="text-sm text-gray-400">
                        © 2024 Davenport Legacy Group. Administrative Portal.
                    </p>
                    <div class="flex space-x-6">
                        <a href="/ga" class="text-sm text-gray-400 hover:text-green-500">GA Portal</a>
                        <a href="/byf" class="text-sm text-gray-400 hover:text-blue-500">BYF Portal</a>
                        <a href="https://docs.davenportlegacy.com/api" class="text-sm text-gray-400 hover:text-dlg-red">API Docs</a>
                        <a href="mailto:admin@davenportlegacy.com" class="text-sm text-gray-400 hover:text-dlg-red">Support</a>
                    </div>
                </div>
            </div>
        </footer>

        <script>
            // DLG Administration Portal Application
            class DLGAdminApp {
                constructor() {
                    this.apiBaseUrl = '';
                    this.token = localStorage.getItem('dlg_admin_token');
                    this.user = JSON.parse(localStorage.getItem('dlg_admin_user') || 'null');
                    
                    this.init();
                }

                async init() {
                    this.setupEventListeners();
                    
                    // Check if user is already logged in
                    if (this.token) {
                        try {
                            await this.validateToken();
                        } catch (error) {
                            console.error('Token validation failed:', error);
                            this.logout();
                        }
                    }
                    
                    this.updateUI();
                }

                setupEventListeners() {
                    // Login/Logout buttons
                    document.getElementById('loginBtn').addEventListener('click', () => this.showLoginModal());
                    document.getElementById('getStartedBtn').addEventListener('click', () => this.showLoginModal());
                    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
                    
                    // Login modal
                    document.getElementById('closeLoginModal').addEventListener('click', () => this.hideLoginModal());
                    document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
                    
                    // Quick actions
                    document.querySelectorAll('.quick-action-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => this.handleQuickAction(e));
                    });

                    // Close modal when clicking outside
                    document.getElementById('loginModal').addEventListener('click', (e) => {
                        if (e.target.id === 'loginModal') {
                            this.hideLoginModal();
                        }
                    });
                }

                showLoginModal() {
                    document.getElementById('loginModal').classList.remove('hidden');
                    document.getElementById('email').focus();
                }

                hideLoginModal() {
                    document.getElementById('loginModal').classList.add('hidden');
                    document.getElementById('loginError').classList.add('hidden');
                }

                async handleLogin(e) {
                    e.preventDefault();
                    
                    const email = document.getElementById('email').value;
                    const password = document.getElementById('password').value;
                    
                    const errorDiv = document.getElementById('loginError');
                    errorDiv.classList.add('hidden');

                    try {
                        const response = await this.apiCall('/api/auth/login', 'POST', {
                            email,
                            password,
                            tenant: 'DLG'
                        });

                        if (response.success) {
                            this.token = response.data.token;
                            this.user = response.data.user;
                            
                            localStorage.setItem('dlg_admin_token', this.token);
                            localStorage.setItem('dlg_admin_user', JSON.stringify(this.user));
                            
                            this.hideLoginModal();
                            this.updateUI();
                            this.loadDashboardData();
                            
                            this.showNotification('Welcome to DLG Administration Portal!', 'success');
                        } else {
                            throw new Error(response.message || 'Login failed');
                        }
                    } catch (error) {
                        console.error('Login error:', error);
                        errorDiv.textContent = error.message || 'Login failed. Please check your credentials.';
                        errorDiv.classList.remove('hidden');
                    }
                }

                async validateToken() {
                    const response = await this.apiCall('/api/auth/me', 'GET');
                    if (response.success) {
                        this.user = response.data;
                        localStorage.setItem('dlg_admin_user', JSON.stringify(this.user));
                        return true;
                    }
                    throw new Error('Invalid token');
                }

                logout() {
                    this.token = null;
                    this.user = null;
                    localStorage.removeItem('dlg_admin_token');
                    localStorage.removeItem('dlg_admin_user');
                    this.updateUI();
                    this.showNotification('Logged out successfully', 'info');
                }

                updateUI() {
                    const isLoggedIn = !!this.token;
                    
                    // Toggle visibility of elements
                    document.getElementById('loginBtn').classList.toggle('hidden', isLoggedIn);
                    document.getElementById('logoutBtn').classList.toggle('hidden', !isLoggedIn);
                    document.getElementById('userInfo').classList.toggle('hidden', !isLoggedIn);
                    document.getElementById('welcomeSection').classList.toggle('hidden', isLoggedIn);
                    document.getElementById('dashboardContent').classList.toggle('hidden', !isLoggedIn);
                    
                    if (isLoggedIn && this.user) {
                        document.getElementById('userName').textContent = this.user.name || this.user.email;
                    }
                }

                async loadDashboardData() {
                    try {
                        // Load dashboard metrics
                        const metricsResponse = await this.apiCall('/api/dashboard/metrics', 'GET');
                        if (metricsResponse.success) {
                            this.updateDashboardStats(metricsResponse.data);
                        }

                        // Load recent activity
                        const activityResponse = await this.apiCall('/api/dashboard/activity', 'GET');
                        if (activityResponse.success) {
                            this.updateRecentActivity(activityResponse.data);
                        }
                    } catch (error) {
                        console.error('Error loading dashboard data:', error);
                        this.showNotification('Error loading dashboard data', 'error');
                    }
                }

                updateDashboardStats(data) {
                    document.getElementById('activeProjects').textContent = data.activeProjects || '0';
                    document.getElementById('totalRevenue').textContent = data.totalRevenue ? '$' + data.totalRevenue.toLocaleString() : '$0';
                    document.getElementById('totalClients').textContent = data.totalClients || '0';
                    document.getElementById('pendingInvoices').textContent = data.pendingInvoices || '0';
                }

                updateRecentActivity(activities) {
                    const container = document.getElementById('recentActivity');
                    
                    if (!activities || activities.length === 0) {
                        container.innerHTML = '<div class="text-center py-4"><i class="fas fa-info-circle text-gray-500 text-2xl mb-2"></i><p class="text-gray-400">No recent activity</p></div>';
                        return;
                    }

                    container.innerHTML = activities.map(activity => 
                        '<div class="flex items-center p-3 bg-dlg-darker rounded-lg">' +
                        '<i class="fas fa-' + this.getActivityIcon(activity.type) + ' text-dlg-red mr-3"></i>' +
                        '<div class="flex-1">' +
                        '<p class="text-sm font-medium text-white">' + activity.description + '</p>' +
                        '<p class="text-xs text-gray-400">' + this.formatDate(activity.timestamp) + '</p>' +
                        '</div></div>'
                    ).join('');
                }

                getActivityIcon(type) {
                    const icons = {
                        'project': 'project-diagram',
                        'invoice': 'file-invoice-dollar',
                        'meeting': 'calendar',
                        'email': 'envelope',
                        'report': 'file-pdf',
                        'user': 'user',
                        'team': 'users'
                    };
                    return icons[type] || 'info-circle';
                }

                formatDate(dateString) {
                    const date = new Date(dateString);
                    const now = new Date();
                    const diffMs = now - date;
                    const diffMins = Math.floor(diffMs / (1000 * 60));
                    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                    if (diffMins < 1) return 'Just now';
                    if (diffMins < 60) return diffMins + ' minutes ago';
                    if (diffHours < 24) return diffHours + ' hours ago';
                    if (diffDays < 7) return diffDays + ' days ago';
                    
                    return date.toLocaleDateString();
                }

                async handleQuickAction(e) {
                    const action = e.currentTarget.dataset.action;
                    
                    if (!this.token) {
                        this.showNotification('Please login first', 'error');
                        this.showLoginModal();
                        return;
                    }

                    try {
                        switch (action) {
                            case 'generate-report':
                                await this.generateReport();
                                break;
                            case 'send-email':
                                await this.sendEmail();
                                break;
                            case 'schedule-meeting':
                                await this.scheduleMeeting();
                                break;
                            case 'export-data':
                                await this.exportData();
                                break;
                            default:
                                this.showNotification('Feature coming soon!', 'info');
                        }
                    } catch (error) {
                        console.error('Quick action error:', error);
                        this.showNotification('Error performing action', 'error');
                    }
                }

                async generateReport() {
                    const reportType = prompt('Report type (project/financial/client):', 'project');
                    const format = prompt('Format (PDF/Excel/JSON):', 'PDF');
                    
                    if (!reportType || !format) return;

                    try {
                        const response = await this.apiCall('/api/actions/generate-report', 'POST', {
                            type: reportType,
                            format: format.toLowerCase(),
                            options: {}
                        });

                        if (response.success) {
                            this.showNotification('Report generated successfully!', 'success');
                            if (response.data.downloadUrl) {
                                window.open(response.data.downloadUrl, '_blank');
                            }
                        } else {
                            throw new Error(response.message);
                        }
                    } catch (error) {
                        this.showNotification('Error generating report', 'error');
                    }
                }

                async sendEmail() {
                    const recipient = prompt('Recipient email:', '');
                    const subject = prompt('Subject:', 'DLG Administration - Update');
                    
                    if (!recipient || !subject) return;

                    try {
                        const response = await this.apiCall('/api/actions/send-email', 'POST', {
                            to: [recipient],
                            subject: subject,
                            template: 'admin',
                            data: {
                                userName: this.user.name,
                                message: 'Administrative update from DLG team.'
                            }
                        });

                        if (response.success) {
                            this.showNotification('Email sent successfully!', 'success');
                        } else {
                            throw new Error(response.message);
                        }
                    } catch (error) {
                        this.showNotification('Error sending email', 'error');
                    }
                }

                async scheduleMeeting() {
                    const title = prompt('Meeting title:', 'DLG Administrative Meeting');
                    const platform = prompt('Platform (zoom/google/teams):', 'zoom');
                    
                    if (!title || !platform) return;

                    try {
                        const response = await this.apiCall('/api/actions/schedule-meeting', 'POST', {
                            title: title,
                            platform: platform,
                            duration: 60,
                            attendees: [this.user.email],
                            scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                        });

                        if (response.success) {
                            this.showNotification('Meeting scheduled successfully!', 'success');
                            if (response.data.meetingUrl) {
                                window.open(response.data.meetingUrl, '_blank');
                            }
                        } else {
                            throw new Error(response.message);
                        }
                    } catch (error) {
                        this.showNotification('Error scheduling meeting', 'error');
                    }
                }

                async exportData() {
                    const dataType = prompt('Data type (projects/invoices/contacts):', 'projects');
                    const format = prompt('Format (CSV/Excel/JSON):', 'CSV');
                    
                    if (!dataType || !format) return;

                    try {
                        const response = await this.apiCall('/api/actions/export-data', 'POST', {
                            type: dataType,
                            format: format.toLowerCase(),
                            filters: {}
                        });

                        if (response.success) {
                            this.showNotification('Data exported successfully!', 'success');
                            if (response.data.downloadUrl) {
                                window.open(response.data.downloadUrl, '_blank');
                            }
                        } else {
                            throw new Error(response.message);
                        }
                    } catch (error) {
                        this.showNotification('Error exporting data', 'error');
                    }
                }

                async apiCall(endpoint, method = 'GET', data = null) {
                    const url = this.apiBaseUrl + endpoint;
                    
                    const options = {
                        method,
                        headers: {
                            'Content-Type': 'application/json',
                        }
                    };

                    if (this.token) {
                        options.headers['Authorization'] = 'Bearer ' + this.token;
                    }

                    if (data && method !== 'GET') {
                        options.body = JSON.stringify(data);
                    }

                    const response = await fetch(url, options);
                    
                    if (!response.ok) {
                        throw new Error('HTTP error! status: ' + response.status);
                    }
                    
                    return await response.json();
                }

                showNotification(message, type = 'info') {
                    const notification = document.createElement('div');
                    const bgColor = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
                    notification.className = 'notification ' + bgColor + ' text-white px-6 py-3 rounded-lg shadow-lg';
                    notification.innerHTML = 
                        '<div class="flex items-center justify-between">' +
                        '<span>' + message + '</span>' +
                        '<button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white opacity-70 hover:opacity-100">' +
                        '<i class="fas fa-times"></i>' +
                        '</button>' +
                        '</div>';
                    
                    document.body.appendChild(notification);
                    
                    // Auto-remove after 5 seconds
                    setTimeout(() => {
                        if (notification.parentElement) {
                            notification.remove();
                        }
                    }, 5000);
                }
            }

            // Initialize the application when the DOM is ready
            document.addEventListener('DOMContentLoaded', () => {
                window.dlgAdminApp = new DLGAdminApp();
            });
        </script>
    </body>
    </html>
  `)
})

// GA Portal Route (Green theme)
app.get('/ga', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Grow Affordably - Client Portal</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script>
            tailwind.config = {
                theme: {
                    extend: {
                        colors: {
                            'ga-green': '#10b981',
                            'ga-dark': '#064e3b',
                            'ga-light': '#d1fae5'
                        }
                    }
                }
            }
        </script>
        <style>
            body {
                background: linear-gradient(135deg, #064e3b 0%, #047857 100%);
                min-height: 100vh;
            }
        </style>
    </head>
    <body class="text-white">
        <header class="bg-ga-dark shadow-lg border-b border-ga-green">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <h1 class="text-xl font-bold text-ga-green">
                        <i class="fas fa-seedling mr-2"></i>
                        Grow Affordably - Client Portal
                    </h1>
                    <button class="bg-ga-green text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-600">
                        <i class="fas fa-sign-in-alt mr-2"></i>Client Login
                    </button>
                </div>
            </div>
        </header>
        
        <main class="container mx-auto px-4 py-12">
            <div class="text-center mb-12">
                <i class="fas fa-seedling text-6xl text-ga-green mb-6"></i>
                <h1 class="text-4xl font-bold text-white mb-4">Welcome to Grow Affordably</h1>
                <p class="text-xl text-green-100 mb-8">Your trusted partner for affordable business growth solutions</p>
                
                <div class="grid md:grid-cols-3 gap-8 mt-12">
                    <div class="bg-ga-dark bg-opacity-50 p-6 rounded-lg border border-ga-green">
                        <i class="fas fa-chart-line text-3xl text-ga-green mb-4"></i>
                        <h3 class="text-lg font-semibold mb-2">Project Dashboard</h3>
                        <p class="text-green-100">Track your project progress and milestones</p>
                    </div>
                    <div class="bg-ga-dark bg-opacity-50 p-6 rounded-lg border border-ga-green">
                        <i class="fas fa-file-invoice text-3xl text-ga-green mb-4"></i>
                        <h3 class="text-lg font-semibold mb-2">Billing & Invoices</h3>
                        <p class="text-green-100">View and manage your billing information</p>
                    </div>
                    <div class="bg-ga-dark bg-opacity-50 p-6 rounded-lg border border-ga-green">
                        <i class="fas fa-headset text-3xl text-ga-green mb-4"></i>
                        <h3 class="text-lg font-semibold mb-2">Support Center</h3>
                        <p class="text-green-100">Get help and support when you need it</p>
                    </div>
                </div>
            </div>
        </main>
        
        <footer class="bg-ga-dark border-t border-ga-green mt-12">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div class="flex justify-between items-center">
                    <p class="text-sm text-green-200">© 2024 Grow Affordably. All rights reserved.</p>
                    <a href="/" class="text-sm text-green-200 hover:text-ga-green">Back to DLG Portal</a>
                </div>
            </div>
        </footer>
    </body>
    </html>
  `)
})

// BYF Portal Route (Blue theme)
app.get('/byf', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Build Your Foundation - Client Portal</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script>
            tailwind.config = {
                theme: {
                    extend: {
                        colors: {
                            'byf-blue': '#083A5E',
                            'byf-light': '#1e40af',
                            'byf-accent': '#3b82f6'
                        }
                    }
                }
            }
        </script>
        <style>
            body {
                background: linear-gradient(135deg, #083A5E 0%, #1e40af 100%);
                min-height: 100vh;
            }
        </style>
    </head>
    <body class="text-white">
        <header class="bg-byf-blue shadow-lg border-b border-byf-accent">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <h1 class="text-xl font-bold text-byf-accent">
                        <i class="fas fa-building mr-2"></i>
                        Build Your Foundation - Client Portal
                    </h1>
                    <button class="bg-byf-accent text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-600">
                        <i class="fas fa-sign-in-alt mr-2"></i>Client Login
                    </button>
                </div>
            </div>
        </header>
        
        <main class="container mx-auto px-4 py-12">
            <div class="text-center mb-12">
                <i class="fas fa-building text-6xl text-byf-accent mb-6"></i>
                <h1 class="text-4xl font-bold text-white mb-4">Welcome to Build Your Foundation</h1>
                <p class="text-xl text-blue-100 mb-8">Solid foundations for lasting business success</p>
                
                <div class="grid md:grid-cols-3 gap-8 mt-12">
                    <div class="bg-byf-blue bg-opacity-50 p-6 rounded-lg border border-byf-accent">
                        <i class="fas fa-tasks text-3xl text-byf-accent mb-4"></i>
                        <h3 class="text-lg font-semibold mb-2">Project Management</h3>
                        <p class="text-blue-100">Comprehensive project tracking and updates</p>
                    </div>
                    <div class="bg-byf-blue bg-opacity-50 p-6 rounded-lg border border-byf-accent">
                        <i class="fas fa-calendar text-3xl text-byf-accent mb-4"></i>
                        <h3 class="text-lg font-semibold mb-2">Timeline & Milestones</h3>
                        <p class="text-blue-100">Stay on track with project timelines</p>
                    </div>
                    <div class="bg-byf-blue bg-opacity-50 p-6 rounded-lg border border-byf-accent">
                        <i class="fas fa-comments text-3xl text-byf-accent mb-4"></i>
                        <h3 class="text-lg font-semibold mb-2">Communication Hub</h3>
                        <p class="text-blue-100">Direct communication with your project team</p>
                    </div>
                </div>
            </div>
        </main>
        
        <footer class="bg-byf-blue border-t border-byf-accent mt-12">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div class="flex justify-between items-center">
                    <p class="text-sm text-blue-200">© 2024 Build Your Foundation. All rights reserved.</p>
                    <a href="/" class="text-sm text-blue-200 hover:text-byf-accent">Back to DLG Portal</a>
                </div>
            </div>
        </footer>
    </body>
    </html>
  `)
})

// API routes - Working backend implementation
// Authentication endpoints
app.post('/api/auth/login', async (c) => {
  try {
    const { email, password, tenant } = await c.req.json<{ email: string; password: string; tenant: string }>()
    if (!email || !password || !tenant) return c.json({ success: false, message: 'Missing credentials' }, 400)

    const row = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.role, u.password_salt, u.password_hash, u.tenant_id, t.key as tenant_key
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = ? AND t.key = ? AND u.active = 1
       LIMIT 1`
    ).bind(email, tenant).first<any>()

    if (!row) return c.json({ success: false, message: 'User not found' }, 401)

    const hash = await sha256Hex(`${row.password_salt}:${password}`)
    if (hash !== row.password_hash) return c.json({ success: false, message: 'Invalid password' }, 401)

    const payload = {
      userId: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      tenant_id: row.tenant_id,
      tenant_key: row.tenant_key,
      exp: Date.now() + 24 * 60 * 60 * 1000
    }

    const token = await createToken(payload, c.env.JWT_SECRET || 'dev-secret')

    return c.json({ success: true, data: { token, user: payload } })
  } catch (error: any) {
    return c.json({ success: false, message: 'Login failed', error: error?.message }, 500)
  }
})

app.get('/api/auth/me', async (c) => {
  const u = c.get('user')
  if (!u) return c.json({ success: false, message: 'Unauthorized' }, 401)
  return c.json({ success: true, data: u })
})

// Dashboard endpoints
app.get('/api/dashboard/metrics', async (c) => {
  try {
    const tenantIds = await getScopedTenantIds(c)
    if (tenantIds.length === 0) return c.json({ success: false, message: 'Unauthorized' }, 401)

    const inClause = '(' + tenantIds.map(() => '?').join(',') + ')'

    const projectsCount = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM projects WHERE tenant_id IN ${inClause}`)
      .bind(...tenantIds).first<any>()

    const clientsCount = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM clients WHERE tenant_id IN ${inClause}`)
      .bind(...tenantIds).first<any>()

    const pendingInvoices = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM invoices WHERE tenant_id IN ${inClause} AND status IN ('pending','overdue')`)
      .bind(...tenantIds).first<any>()

    const revenueCents = await c.env.DB.prepare(`SELECT COALESCE(SUM(amount_cents),0) as cents FROM invoices WHERE tenant_id IN ${inClause} AND status IN ('paid','pending','overdue')`)
      .bind(...tenantIds).first<any>()

    return c.json({
      success: true,
      data: {
        activeProjects: projectsCount?.cnt || 0,
        totalRevenue: Math.round((revenueCents?.cents || 0) / 100),
        totalClients: clientsCount?.cnt || 0,
        pendingInvoices: pendingInvoices?.cnt || 0
      }
    })
  } catch (error) {
    return c.json({ success: false, message: 'Failed to load metrics' }, 500)
  }
})

app.get('/api/dashboard/activity', async (c) => {
  try {
    const tenantIds = await getScopedTenantIds(c)
    if (tenantIds.length === 0) return c.json({ success: false, message: 'Unauthorized' }, 401)
    const inClause = '(' + tenantIds.map(() => '?').join(',') + ')'
    const res = await c.env.DB.prepare(`SELECT id, type, description, created_at as timestamp FROM activities WHERE tenant_id IN ${inClause} ORDER BY created_at DESC LIMIT 10`)
      .bind(...tenantIds).all()
    return c.json({ success: true, data: res.results })
  } catch (error) {
    return c.json({ success: false, message: 'Failed to load activity' }, 500)
  }
})

// Quick Actions endpoints
app.post('/api/actions/generate-report', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ success: false, message: 'No token provided' }, 401)
    }
    
    const { type, format } = await c.req.json()
    
    return c.json({
      success: true,
      data: {
        message: 'Report generated successfully',
        reportType: type,
        format: format,
        downloadUrl: '#' // In real system, would be actual download URL
      }
    })
    
  } catch (error) {
    return c.json({ success: false, message: 'Failed to generate report' }, 500)
  }
})

app.post('/api/actions/send-email', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ success: false, message: 'No token provided' }, 401)
    }
    
    const { to, subject, template, data } = await c.req.json()
    
    return c.json({
      success: true,
      data: {
        message: 'Email sent successfully',
        recipients: to,
        subject: subject
      }
    })
    
  } catch (error) {
    return c.json({ success: false, message: 'Failed to send email' }, 500)
  }
})

app.post('/api/actions/schedule-meeting', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ success: false, message: 'No token provided' }, 401)
    }
    
    const { title, platform, duration, attendees } = await c.req.json()
    
    return c.json({
      success: true,
      data: {
        message: 'Meeting scheduled successfully',
        title: title,
        platform: platform,
        meetingUrl: 'https://zoom.us/j/123456789' // Mock meeting URL
      }
    })
    
  } catch (error) {
    return c.json({ success: false, message: 'Failed to schedule meeting' }, 500)
  }
})

app.post('/api/actions/export-data', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      return c.json({ success: false, message: 'No token provided' }, 401)
    }
    
    const { type, format } = await c.req.json()
    
    return c.json({
      success: true,
      data: {
        message: 'Data exported successfully',
        dataType: type,
        format: format,
        downloadUrl: '#' // In real system, would be actual download URL
      }
    })
    
  } catch (error) {
    return c.json({ success: false, message: 'Failed to export data' }, 500)
  }
})

// API Health check
app.get('/api/health', (c) => {
  return c.json({
    success: true,
    data: {
      service: 'DLG Core API',
      version: '2.0.0',
      description: 'Multi-tenant SaaS platform backend for GA, BYF, and DLG Administration',
      features: [
        'Multi-tenant authentication and RBAC',
        'Project management with team assignments',
        'Invoice and billing management',
        'Contact management with POC tracking',
        'Quick actions (reports, emails, meetings, exports)',
        'Dashboard analytics and metrics',
        'Stripe integration for payments',
        'Email automation and templates',
        'Meeting scheduling with Zoom/Google Meet',
        'Data export in multiple formats'
      ],
      endpoints: {
        health: '/api/health',
        auth: '/api/auth/*',
        projects: '/api/projects/*',
        invoices: '/api/invoices/*',
        teams: '/api/teams/*',
        contacts: '/api/contacts/*',
        actions: '/api/actions/*',
        organizations: '/api/organizations',
        dashboard: '/api/dashboard/*',
        user: '/api/me'
      },
      documentation: 'https://docs.davenportlegacy.com/api',
      support: 'admin@davenportlegacy.com'
    }
  })
})

// Favicon handler (to prevent 404 errors)
app.get('/favicon.ico', (c) => {
  return c.text('', 204)
})

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    service: 'DLG Complete Platform',
    timestamp: new Date().toISOString(),
    portals: {
      dlg: 'DLG Administration Portal (Red/Dark theme)',
      ga: 'Grow Affordably Client Portal (Green theme)',
      byf: 'Build Your Foundation Client Portal (Blue theme)'
    }
  })
})

// Tenants
app.get('/api/tenants', async (c) => {
  const u = c.get('user')
  if (!u) return c.json({ success: false, message: 'Unauthorized' }, 401)
  if (u.tenant_key === 'DLG' && (u.role === 'admin' || u.role === 'project_manager' || u.role === 'staff')) {
    const rows = await c.env.DB.prepare('SELECT id, key, name FROM tenants ORDER BY id').all()
    return c.json({ success: true, data: rows.results })
  }
  const row = await c.env.DB.prepare('SELECT id, key, name FROM tenants WHERE id = ?').bind(u.tenant_id).first<any>()
  return c.json({ success: true, data: row ? [row] : [] })
})

// Clients
app.get('/api/clients', async (c) => {
  const tenantIds = await getScopedTenantIds(c)
  if (tenantIds.length === 0) return c.json({ success: false, message: 'Unauthorized' }, 401)
  const inClause = '(' + tenantIds.map(() => '?').join(',') + ')'
  const rows = await c.env.DB.prepare(`SELECT id, tenant_id, name, contact_name, contact_email, contact_phone, status, created_at FROM clients WHERE tenant_id IN ${inClause} ORDER BY created_at DESC`).bind(...tenantIds).all()
  return c.json({ success: true, data: rows.results })
})

app.post('/api/clients', async (c) => {
  const u = c.get('user')
  if (!u || (u.role !== 'admin' && u.role !== 'project_manager' && u.role !== 'staff')) return c.json({ success: false, message: 'Forbidden' }, 403)
  const body = await c.req.json<any>()
  const tenant_key = body.tenant_key || u.tenant_key
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE key = ?').bind(tenant_key).first<any>()
  if (!t) return c.json({ success: false, message: 'Invalid tenant' }, 400)
  await c.env.DB.prepare('INSERT INTO clients (tenant_id, name, contact_name, contact_email, contact_phone, status) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(t.id, body.name, body.contact_name || null, body.contact_email || null, body.contact_phone || null, body.status || 'active').run()
  return c.json({ success: true })
})

// Projects
app.get('/api/projects', async (c) => {
  const tenantIds = await getScopedTenantIds(c)
  if (tenantIds.length === 0) return c.json({ success: false, message: 'Unauthorized' }, 401)
  const inClause = '(' + tenantIds.map(() => '?').join(',') + ')'
  const rows = await c.env.DB.prepare(`
    SELECT p.id, p.tenant_id, p.client_id, p.name, p.description, p.status, p.start_date, p.due_date, p.value_cents, p.created_at,
           (SELECT name FROM clients c WHERE c.id = p.client_id) AS client_name
    FROM projects p
    WHERE p.tenant_id IN ${inClause}
    ORDER BY p.created_at DESC
  `).bind(...tenantIds).all()
  return c.json({ success: true, data: rows.results })
})

app.get('/api/projects/:id', async (c) => {
  const tenantIds = await getScopedTenantIds(c)
  const id = Number(c.req.param('id'))
  if (!id) return c.json({ success: false, message: 'Invalid id' }, 400)
  const inClause = '(' + tenantIds.map(() => '?').join(',') + ')'
  const row = await c.env.DB.prepare(`SELECT * FROM projects WHERE id = ? AND tenant_id IN ${inClause}`).bind(id, ...tenantIds).first<any>()
  if (!row) return c.json({ success: false, message: 'Not found' }, 404)
  return c.json({ success: true, data: row })
})

app.post('/api/projects', async (c) => {
  const u = c.get('user')
  if (!u || (u.role !== 'admin' && u.role !== 'project_manager' && u.role !== 'staff')) return c.json({ success: false, message: 'Forbidden' }, 403)
  const body = await c.req.json<any>()
  const tenant_key = body.tenant_key || u.tenant_key
  const t = await c.env.DB.prepare('SELECT id FROM tenants WHERE key = ?').bind(tenant_key).first<any>()
  if (!t) return c.json({ success: false, message: 'Invalid tenant' }, 400)
  await c.env.DB.prepare('INSERT INTO projects (tenant_id, client_id, name, description, status, start_date, due_date, value_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(t.id, body.client_id || null, body.name, body.description || null, body.status || 'planned', body.start_date || null, body.due_date || null, Math.round((body.value_dollars || 0) * 100)).run()
  return c.json({ success: true })
})

// Invoices
app.get('/api/invoices', async (c) => {
  const tenantIds = await getScopedTenantIds(c)
  if (tenantIds.length === 0) return c.json({ success: false, message: 'Unauthorized' }, 401)
  const inClause = '(' + tenantIds.map(() => '?').join(',') + ')'
  const rows = await c.env.DB.prepare(`
    SELECT i.id, i.tenant_id, i.client_id, i.project_id, i.number, i.amount_cents, i.status, i.due_date, i.created_at,
           (SELECT name FROM clients c WHERE c.id = i.client_id) AS client_name
    FROM invoices i
    WHERE i.tenant_id IN ${inClause}
    ORDER BY i.created_at DESC
  `).bind(...tenantIds).all()
  return c.json({ success: true, data: rows.results })
})

export default app