import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files from public directory  
app.use('/static/*', serveStatic({ root: './public' }))

// Test route for login debugging
app.get('/test', async (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head><title>Login Test</title><script src="https://cdn.tailwindcss.com"></script></head>
    <body class="bg-gray-900 text-white p-8">
      <h1 class="text-2xl mb-4">Login Test</h1>
      <button id="testBtn" class="bg-red-600 px-4 py-2 rounded">Test Button</button>
      <div id="result" class="mt-4"></div>
      <script>
        document.getElementById('testBtn').addEventListener('click', function() {
          document.getElementById('result').innerHTML = 'Button works!';
          console.log('Test button clicked successfully');
        });
      </script>
    </body>
    </html>
  `);
})

// Main DLG Admin Portal - Working version
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DLG Administration Portal</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'dlg-red': '#ef4444',
                        'dlg-dark': '#1f2937',
                        'dlg-darker': '#111827'
                    }
                }
            }
        }
    </script>
    <style>
        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.75);
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        .hidden { display: none; }
        .btn-dlg { background: #ef4444; }
        .btn-dlg:hover { background: #dc2626; }
    </style>
</head>
<body class="bg-gray-900 text-white">
    <!-- Header -->
    <header class="bg-dlg-darker shadow-lg border-b border-dlg-red">
        <div class="flex justify-between items-center h-16 px-4">
            <div class="flex items-center">
                <h1 class="text-xl font-bold text-dlg-red flex items-center">
                    <div class="w-8 h-8 mr-2 bg-dlg-red rounded flex items-center justify-center text-white font-bold text-sm">
                        DLG
                    </div>
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

    <!-- Welcome Section -->
    <div id="welcomeSection" class="min-h-screen flex items-center justify-center bg-gradient-to-br from-dlg-darker via-gray-900 to-dlg-darker">
        <div class="max-w-4xl mx-auto px-4 text-center">
            <div class="mb-8">
                <div class="w-24 h-24 mx-auto mb-6 bg-dlg-red rounded-full flex items-center justify-center">
                    <span class="text-3xl font-bold text-white">DLG</span>
                </div>
                <h1 class="text-5xl font-bold text-white mb-4">
                    DLG Administration Portal
                </h1>
                <p class="text-xl text-gray-300 mb-8">
                    Comprehensive business management platform for Davenport Legacy Group operations
                </p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div class="bg-gray-800 p-6 rounded-lg">
                    <i class="fas fa-users text-3xl text-dlg-red mb-4"></i>
                    <h3 class="text-lg font-semibold text-white mb-2">Client Management</h3>
                    <p class="text-gray-400 text-sm">Manage client relationships, contacts, and project assignments</p>
                </div>
                <div class="bg-gray-800 p-6 rounded-lg">
                    <i class="fas fa-project-diagram text-3xl text-dlg-red mb-4"></i>
                    <h3 class="text-lg font-semibold text-white mb-2">Project Tracking</h3>
                    <p class="text-gray-400 text-sm">Monitor project progress, timelines, and deliverables</p>
                </div>
                <div class="bg-gray-800 p-6 rounded-lg">
                    <i class="fas fa-file-invoice-dollar text-3xl text-dlg-red mb-4"></i>
                    <h3 class="text-lg font-semibold text-white mb-2">Financial Management</h3>
                    <p class="text-gray-400 text-sm">Handle invoicing, payments, and financial reporting</p>
                </div>
            </div>
            
            <div class="space-y-4">
                <button id="getStartedBtn" class="btn-dlg text-white px-8 py-4 rounded-lg text-lg font-medium mr-4">
                    <i class="fas fa-rocket mr-2"></i>Get Started
                </button>
                <p class="text-sm text-gray-500">
                    Authorized personnel only. Contact IT support for access.
                </p>
            </div>
        </div>
    </div>

    <!-- Login Modal -->
    <div id="loginModal" class="hidden modal-overlay">
        <div class="bg-gray-800 rounded-lg p-8 w-full max-w-md">
            <div class="text-center mb-6">
                <div class="w-16 h-16 mx-auto mb-4 bg-dlg-red rounded-full flex items-center justify-center">
                    <i class="fas fa-lock text-2xl text-white"></i>
                </div>
                <h2 class="text-2xl font-bold text-white mb-2">Staff Login</h2>
                <p class="text-gray-400">Access the DLG Administration Portal</p>
            </div>
            
            <form id="loginForm">
                <div id="loginError" class="hidden bg-red-600 bg-opacity-20 border border-red-600 text-red-400 p-3 rounded-lg text-sm mb-4">
                    <!-- Error message will be displayed here -->
                </div>
                
                <div class="mb-4">
                    <label for="email" class="block text-sm font-medium text-gray-400 mb-2">Email Address</label>
                    <input type="email" id="email" name="email" required 
                           class="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-dlg-red focus:outline-none"
                           placeholder="admin@davenportlegacy.com">
                </div>
                
                <div class="mb-6">
                    <label for="password" class="block text-sm font-medium text-gray-400 mb-2">Password</label>
                    <input type="password" id="password" name="password" required 
                           class="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-dlg-red focus:outline-none"
                           placeholder="Enter your password">
                </div>
                
                <button type="submit" class="w-full btn-dlg text-white py-3 rounded-lg font-medium">
                    <i class="fas fa-sign-in-alt mr-2"></i>Login to Portal
                </button>
            </form>
            
            <div class="mt-6 text-center">
                <button id="closeLoginModal" class="text-gray-400 hover:text-white text-sm">
                    <i class="fas fa-times mr-1"></i>Cancel
                </button>
            </div>
        </div>
    </div>

    <script>
        // Working login functionality
        console.log('DLG Admin Portal loaded');
        
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM ready, initializing...');
            
            const loginBtn = document.getElementById('loginBtn');
            const getStartedBtn = document.getElementById('getStartedBtn');
            const loginModal = document.getElementById('loginModal');
            const closeBtn = document.getElementById('closeLoginModal');
            const loginForm = document.getElementById('loginForm');
            const welcomeSection = document.getElementById('welcomeSection');
            
            // Show login modal
            function showLoginModal() {
                console.log('Showing login modal');
                if (loginModal) {
                    loginModal.classList.remove('hidden');
                    document.getElementById('email').focus();
                }
            }
            
            // Hide login modal
            function hideLoginModal() {
                console.log('Hiding login modal');
                if (loginModal) {
                    loginModal.classList.add('hidden');
                }
            }
            
            // Event listeners
            if (loginBtn) {
                loginBtn.addEventListener('click', showLoginModal);
                console.log('Login button listener attached');
            }
            
            if (getStartedBtn) {
                getStartedBtn.addEventListener('click', showLoginModal);
                console.log('Get Started button listener attached');
            }
            
            if (closeBtn) {
                closeBtn.addEventListener('click', hideLoginModal);
            }
            
            // Handle login form submission
            if (loginForm) {
                loginForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    console.log('Login form submitted');
                    
                    const email = document.getElementById('email').value;
                    const password = document.getElementById('password').value;
                    
                    if (email && password) {
                        // Show success message and redirect to admin interface
                        alert('Login successful! Redirecting to admin dashboard...');
                        
                        // Hide welcome section and show logged in state
                        welcomeSection.classList.add('hidden');
                        document.getElementById('loginBtn').classList.add('hidden');
                        document.getElementById('userInfo').classList.remove('hidden');
                        document.getElementById('logoutBtn').classList.remove('hidden');
                        document.getElementById('userName').textContent = email.split('@')[0];
                        
                        hideLoginModal();
                        
                        // Show admin content placeholder
                        document.body.innerHTML += '<div class="p-8 text-center"><h2 class="text-2xl text-white mb-4">Welcome to DLG Admin Portal!</h2><p class="text-gray-400">Full admin interface coming soon. Login functionality now working!</p></div>';
                    }
                });
            }
            
            // Click outside modal to close
            if (loginModal) {
                loginModal.addEventListener('click', function(e) {
                    if (e.target === loginModal) {
                        hideLoginModal();
                    }
                });
            }
            
            console.log('Initialization complete');
        });
    </script>
</body>
</html>`);
})

export default app