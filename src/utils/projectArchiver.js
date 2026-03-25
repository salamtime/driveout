import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Completely authentication-free project archiver
class ProjectArchiver {
  constructor() {
    this.zip = new JSZip();
    this.fileCount = 0;
    this.processedCount = 0;
    this.onProgress = null;
  }

  setProgressCallback(callback) {
    this.onProgress = callback;
  }

  updateProgress() {
    this.processedCount++;
    if (this.onProgress) {
      const progress = Math.round((this.processedCount / this.fileCount) * 100);
      this.onProgress(progress, this.processedCount, this.fileCount);
    }
  }

  getProjectFiles() {
    // Static project files - no external dependencies or authentication
    const projectFiles = [
      // Core configuration files
      {
        path: 'package.json',
        content: JSON.stringify({
          "name": "react-template-export",
          "version": "1.0.0",
          "type": "module",
          "scripts": {
            "dev": "vite",
            "build": "vite build",
            "lint": "eslint ./src --quiet",
            "preview": "vite preview"
          },
          "dependencies": {
            "react": "^18.2.0",
            "react-dom": "^18.2.0",
            "react-router-dom": "^6.8.1",
            "react-redux": "^8.0.5",
            "@reduxjs/toolkit": "^1.9.3",
            "@supabase/supabase-js": "^2.39.3",
            "@radix-ui/react-dialog": "^1.1.14",
            "@radix-ui/react-progress": "^1.1.7",
            "@radix-ui/react-label": "^2.1.7",
            "@radix-ui/react-switch": "^1.2.5",
            "@radix-ui/react-separator": "^1.1.7",
            "@radix-ui/react-slot": "^1.2.3",
            "class-variance-authority": "^0.7.1",
            "clsx": "^2.1.1",
            "tailwind-merge": "^3.3.1",
            "lucide-react": "^0.263.1",
            "jszip": "^3.10.1",
            "file-saver": "^2.0.5"
          },
          "devDependencies": {
            "@vitejs/plugin-react": "^4.2.1",
            "vite": "^5.1.4",
            "eslint": "^8.56.0",
            "tailwindcss": "^3.3.0",
            "autoprefixer": "^10.4.14",
            "postcss": "^8.4.24"
          }
        }, null, 2)
      },
      {
        path: 'vite.config.js',
        content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  }
})
`
      },
      {
        path: 'tailwind.config.js',
        content: `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`
      },
      {
        path: 'postcss.config.js',
        content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`
      },
      {
        path: '.env.example',
        content: `# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Development
VITE_APP_ENV=development
`
      },
      {
        path: '.gitignore',
        content: `# Dependencies
node_modules/
/.pnp
.pnp.js

# Production
/dist
/build

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Runtime
*.pid
*.seed
*.pid.lock

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`
      },
      {
        path: 'README.md',
        content: `# React Template Project

This is a complete React application with Supabase integration and modern UI components.

## 🚀 Features
- **Authentication system** with Supabase Auth
- **Admin dashboard** with user management
- **Project export functionality** for easy deployment
- **Responsive UI** with Tailwind CSS and Radix UI components
- **State management** with Redux Toolkit
- **Modern routing** with React Router

## 📋 Setup Instructions

### 1. Extract and Install
\`\`\`bash
# Extract the downloaded archive
unzip project-export-[timestamp].zip
cd project-export-[timestamp]

# Install dependencies
npm install
# or
pnpm install
\`\`\`

### 2. Environment Configuration
\`\`\`bash
# Copy environment template
cp .env.example .env

# Edit .env with your Supabase credentials
# VITE_SUPABASE_URL=your_supabase_url_here
# VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
\`\`\`

### 3. Start Development Server
\`\`\`bash
npm run dev
# or
pnpm run dev
\`\`\`

Visit: http://localhost:5173

## 📁 Project Structure
\`\`\`
src/
├── components/          # Reusable React components
│   ├── admin/          # Admin-specific components
│   ├── auth/           # Authentication components
│   ├── common/         # Common UI components
│   └── ui/             # Base UI components (Radix UI)
├── pages/              # Page components
│   ├── admin/          # Admin pages
│   └── auth/           # Auth pages
├── hooks/              # Custom React hooks
├── store/              # Redux store and slices
├── utils/              # Utility functions
└── lib/                # Library configurations
\`\`\`

## 🛠️ Available Scripts
- \`npm run dev\` - Start development server
- \`npm run build\` - Build for production
- \`npm run lint\` - Run ESLint
- \`npm run preview\` - Preview production build

## 🔧 Key Technologies
- **React 18** - UI library
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Radix UI** - Accessible components
- **Redux Toolkit** - State management
- **React Router** - Routing
- **Supabase** - Backend services
- **ESLint** - Code linting

Generated on: ${new Date().toISOString()}
Archive created by: Project Export System
`
      },
      {
        path: 'index.html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React Template - Admin Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`
      },
      // Source files
      {
        path: 'src/main.jsx',
        content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
)
`
      },
      {
        path: 'src/index.css',
        content: `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 84% 4.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`
      },
      {
        path: 'src/App.jsx',
        content: `import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AuthLayout from './components/auth/AuthLayout'
import AdminLayout from './components/admin/AdminLayout'
import Login from './pages/auth/Login'
import Dashboard from './pages/admin/Dashboard'
import UserManagement from './pages/admin/UserManagement'
import SystemSettings from './pages/admin/SystemSettings'
import ProtectedRoute from './components/common/ProtectedRoute'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          {/* Public routes */}
          <Route path="/auth/*" element={<AuthLayout />}>
            <Route path="login" element={<Login />} />
          </Route>

          {/* Protected admin routes */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute requireAuth={true}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="system-settings" element={<SystemSettings />} />
          </Route>

          {/* Default redirects */}
          <Route
            path="/"
            element={
              user ? (
                <Navigate to="/admin/dashboard" replace />
              ) : (
                <Navigate to="/auth/login" replace />
              )
            }
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App
`
      },
      // Component samples
      {
        path: 'src/components/ui/button.jsx',
        content: `import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
`
      },
      {
        path: 'src/lib/utils.js',
        content: `import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
`
      }
    ];

    return projectFiles;
  }

  async generateArchive(projectName = 'project-export') {
    try {
      // Reset counters
      this.processedCount = 0;
      this.zip = new JSZip();

      // Get all project files (purely client-side, no authentication needed)
      const files = this.getProjectFiles();
      this.fileCount = files.length;

      // Add files to zip with progress tracking
      for (const file of files) {
        this.zip.file(file.path, file.content);
        this.updateProgress();
        
        // Small delay to show progress for user experience
        if (this.processedCount % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Generate the zip file
      const zipBlob = await this.zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      });

      // Trigger immediate download
      const fileName = `${projectName}-${Date.now()}.zip`;
      saveAs(zipBlob, fileName);

      return {
        success: true,
        fileName: fileName,
        fileCount: this.fileCount,
        size: zipBlob.size
      };

    } catch (error) {
      console.error('Archive generation failed:', error);
      throw new Error(`Failed to generate archive: ${error.message}`);
    }
  }
}

export default ProjectArchiver;