#!/usr/bin/env python3
"""
Simple HTTP server for static files (Railway deployment)
Serves the iLARS web application
"""
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

class StaticHandler(SimpleHTTPRequestHandler):
    """Handler for static files with SPA routing support"""
    
    def __init__(self, *args, **kwargs):
        self.directory = os.path.dirname(os.path.abspath(__file__))
        super().__init__(*args, **kwargs)
    
    def translate_path(self, path):
        """Translate URL path to file system path"""
        try:
            path = urlparse(path).path
            path = path.lstrip('/')
            
            # If path is empty or root, serve index.html
            if not path or path == '/':
                index_path = os.path.join(self.directory, 'index.html')
                if os.path.exists(index_path):
                    return index_path
                else:
                    print(f"ERROR: index.html not found at {index_path}", file=sys.stderr)
                    return index_path
            
            file_path = os.path.join(self.directory, path)
            
            # If file doesn't exist, serve index.html (for SPA client-side routing)
            if not os.path.exists(file_path) or os.path.isdir(file_path):
                return os.path.join(self.directory, 'index.html')
            
            return file_path
        except Exception as e:
            print(f"ERROR in translate_path: {e}", file=sys.stderr)
            return os.path.join(self.directory, 'index.html')
    
    def do_GET(self):
        """Handle GET requests"""
        try:
            return super().do_GET()
        except Exception as e:
            print(f"ERROR in do_GET: {e}", file=sys.stderr)
            self.send_error(500, f"Internal Server Error: {str(e)}")
    
    def end_headers(self):
        """Add headers for better caching and CORS"""
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        
        # Add caching headers
        if self.path.endswith('.html'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        elif self.path.endswith('.js') or self.path.endswith('.css'):
            # Don't cache JS and CSS files to ensure updates are picked up
            self.send_header('Cache-Control', 'no-cache, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        else:
            # Cache other static assets
            self.send_header('Cache-Control', 'public, max-age=31536000')
        
        super().end_headers()
    
    def log_message(self, format, *args):
        """Log messages to stderr for Railway logs"""
        message = format % args
        print(f"[{self.log_date_time_string()}] {message}", file=sys.stderr)

def main():
    """Main function to start the server"""
    try:
        port = int(os.environ.get('PORT', 8000))
        host = os.environ.get('HOST', '0.0.0.0')
        
        # Verify index.html exists
        index_path = os.path.join(os.path.dirname(__file__), 'index.html')
        if not os.path.exists(index_path):
            print(f"ERROR: index.html not found at {index_path}", file=sys.stderr)
            print(f"Current directory: {os.getcwd()}", file=sys.stderr)
            print(f"Files in directory: {os.listdir(os.path.dirname(__file__))}", file=sys.stderr)
            sys.exit(1)
        
        server = HTTPServer((host, port), StaticHandler)
        print(f"Server starting on http://{host}:{port}", file=sys.stderr)
        print(f"Serving files from: {os.path.dirname(__file__)}", file=sys.stderr)
        print(f"index.html exists: {os.path.exists(index_path)}", file=sys.stderr)
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped by user", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        print(f"ERROR starting server: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
