import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { readFileSync } from 'fs'
import { join } from 'path'

const app = new Hono()

// Enable CORS for all routes
app.use('*', cors({
  origin: ['https://app.davenportlegacy.com', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

// Serve static files for all portals
app.use('/static/*', serveStatic({ root: './public' }))

// Helper function to load HTML files (for development - in production these would be built)
function loadHTML(filePath: string) {
  try {
    return readFileSync(join(process.cwd(), filePath), 'utf-8')
  } catch (error) {
    return `
      <!DOCTYPE html>
      <html><head><title>File Not Found</title></head>
      <body>
        <h1>File not found: ${filePath}</h1>
        <p>Error: ${error}</p>
      </body></html>
    `
  }
}

// Main DLG Admin Portal (Red/Dark theme) - This is the primary interface
app.get('/', (c) => {
  // In production, this would load from the built files
  // For now, return the DLG admin portal directly
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
        </style>
    </head>
    <body class="text-white">
        <!-- Header -->
        <header class="bg-dlg-darker shadow-lg border-b border-dlg-red">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <div class="flex items-center">
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
            </div>
        </header>

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
                        <input type="email" id="email" class="w-full px-3 py-2 bg-dlg-dark border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-dlg-red focus:border-transparent" placeholder="admin@davenportlegacy.com" required>
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
        <main class="min-h-screen pt-16">
            <!-- Welcome Section (shown when not logged in) -->
            <div id="welcomeSection" class="text-center py-12">
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

            <!-- Dashboard Content (Hidden by default) -->
            <div id="dashboardContent" class="hidden p-6">
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
                    this.apiBaseUrl = 'https://app.davenportlegacy.com';
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

// API routes that proxy to the backend
app.all('/api/*', async (c) => {
  const path = c.req.path
  const method = c.req.method
  const headers = Object.fromEntries(c.req.raw.headers.entries())
  
  // Forward the request to the actual API
  const apiUrl = 'https://app.davenportlegacy.com' + path
  
  try {
    let body = undefined
    if (method !== 'GET' && method !== 'HEAD') {
      body = await c.req.text()
    }
    
    const response = await fetch(apiUrl, {
      method,
      headers,
      body
    })
    
    const responseText = await response.text()
    
    return new Response(responseText, {
      status: response.status,
      headers: response.headers
    })
  } catch (error) {
    return c.json({ error: 'API request failed', message: error.message }, 500)
  }
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

export default app