const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Constants
const PLATFORM_EXECUTABLES = {
  win32: 'proxy-win.exe',
  darwin: 'proxy-macos',
  linux: 'proxy-linux'
};

const SERVER_PORT = 51837;
const WEBVIEW_ID = 'telegramWebview';
const COMMAND_ID = 'telegram-vscode.openTelegramWeb';

let logger;
let serverProcess;

/**
 * Get the platform-specific server executable path
 * @returns {string} Path to server executable
 * @throws {Error} If platform is unsupported
 */
function getServerPath(context) {
  const platform = os.platform();
  const executable = PLATFORM_EXECUTABLES[platform];

  if (!executable) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const serverPath = path.join(context.extensionPath, 'binaries', executable);
  
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Server binary not found at: ${serverPath}`);
  }
  
  if (platform !== 'win32') {
    try {
      fs.chmodSync(serverPath, 0o755);
      logger.appendLine(`Set executable permission for: ${serverPath}`);
    } catch (err) {
      logger.appendLine(`Warning: Could not set executable permission: ${err.message}`);
    }
  }
  
  return serverPath;
}

/**
 * Start the Telegram proxy server
 * @returns {Promise<void>}
 */
function startServer(context) {
  return new Promise((resolve, reject) => {
    try {
      const serverPath = getServerPath(context);
      
      logger.appendLine(`Starting server: ${serverPath}`);
      
      serverProcess = spawn(serverPath, [], {
        cwd: path.dirname(serverPath),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let serverStarted = false;

      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        logger.appendLine(`[SERVER] ${output}`);
        
        if (output.includes('Starting') || output.includes('51837')) {
          serverStarted = true;
          logger.appendLine('Server is running on port 51837');
        }
      });

      serverProcess.stderr.on('data', (data) => {
        logger.appendLine(`[SERVER ERROR] ${data.toString()}`);
      });

      serverProcess.on('error', (err) => {
        logger.appendLine(`Server process error: ${err.message}`);
        if (!serverStarted) {
          reject(err);
        }
      });

      serverProcess.on('exit', (code, signal) => {
        logger.appendLine(`Server exited with code ${code} and signal ${signal}`);
        if (code !== 0 && !serverStarted) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });
      
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          logger.appendLine('Server process is running, attempting to verify connection...');
          
          const http = require('http');
          const req = http.get(`http://localhost:${SERVER_PORT}`, (res) => {
            logger.appendLine(`Server responded with status: ${res.statusCode}`);
            resolve();
          });
          
          req.on('error', (err) => {
            logger.appendLine(`Could not connect to server: ${err.message}`);
            logger.appendLine('Server process is running but may not be listening yet. Continuing anyway...');
            resolve();
          });
          
          req.setTimeout(2000, () => {
            req.destroy();
            logger.appendLine('Connection check timeout, but server process is running');
            resolve();
          });
        } else {
          reject(new Error('Server process failed to start'));
        }
      }, 3000);
      
    } catch (error) {
      logger.appendLine(`Failed to start server: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Stop the server process if running
 */
function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    logger.appendLine('Stopping server...');
    serverProcess.kill();
    serverProcess = null;
  }
}

/**
 * Generate HTML content for the webview
 * @returns {string} HTML content
 */
function getWebviewContent() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:${SERVER_PORT}; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
      <title>Telegram Web</title>
      <style>
        body, html {
          margin: 0;
          padding: 0;
          height: 100%;
          width: 100%;
          overflow: hidden;
          background: #17212b;
        }
        iframe {
          border: none;
          height: 100%;
          width: 100%;
          display: block;
        }
        .loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-family: system-ui, -apple-system, sans-serif;
          color: #fff;
          text-align: center;
        }
        .spinner {
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top: 3px solid #fff;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .error {
          color: #ff6b6b;
        }
      </style>
    </head>
    <body>
      <div class="loading" id="loading">
        <div class="spinner"></div>
        <div>Loading Telegram...</div>
        <div style="font-size: 12px; margin-top: 10px; opacity: 0.7;">Connecting to localhost:${SERVER_PORT}</div>
      </div>
      <iframe 
        src="http://localhost:${SERVER_PORT}" 
        id="telegram-frame"
        allow="microphone; camera"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
        style="display: none;"
      ></iframe>
      <script>
        (function() {
          const vscode = acquireVsCodeApi();
          const iframe = document.getElementById('telegram-frame');
          const loading = document.getElementById('loading');
          let retryCount = 0;
          const maxRetries = 5;

          function showError(message) {
            loading.innerHTML = \`
              <div class="error">
                <div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>
                <div>\${message}</div>
                <div style="font-size: 12px; margin-top: 10px;">Check the Output panel (Telegram-VSCode) for details</div>
              </div>
            \`;
          }

          function retryLoad() {
            if (retryCount < maxRetries) {
              retryCount++;
              loading.querySelector('div:last-child').textContent = 
                \`Retry attempt \${retryCount}/\${maxRetries}...\`;
              
              setTimeout(() => {
                iframe.src = iframe.src + '?retry=' + retryCount;
              }, 2000);
            } else {
              showError('Failed to connect to Telegram proxy server after ' + maxRetries + ' attempts');
            }
          }

          iframe.addEventListener('load', () => {
            console.log('Iframe loaded successfully');
            loading.style.display = 'none';
            iframe.style.display = 'block';
            vscode.postMessage({ 
              type: 'iframe-loaded',
              timestamp: Date.now()
            });
          });

          iframe.addEventListener('error', (e) => {
            console.error('Iframe error:', e);
            retryLoad();
          });

          // Check load from timeout
          setTimeout(() => {
            if (loading.style.display !== 'none') {
              console.log('Timeout waiting for iframe to load');
              retryLoad();
            }
          }, 10000);

          window.addEventListener('message', (event) => {
            console.log('Received message:', event.data);
          });
        })();
      </script>
    </body>
    </html>
  `;
}

/**
 * Create a webview panel for Telegram
 */
function createTelegramPanel() {
  const panel = vscode.window.createWebviewPanel(
    'telegramWebviewTab',
    'Telegram',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: []
    }
  );

  panel.webview.html = getWebviewContent();

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.type) {
        case 'iframe-loaded':
          logger.appendLine('Telegram iframe loaded successfully');
          vscode.window.showInformationMessage('Telegram loaded successfully!');
          break;
        default:
          logger.appendLine(`Unknown message type: ${message.type}`);
      }
    },
    undefined,
    []
  );

  panel.onDidDispose(
    () => {
      logger.appendLine('Telegram panel disposed');
    },
    undefined,
    []
  );

  return panel;
}

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  logger = vscode.window.createOutputChannel('Telegram-VSCode');
  logger.show();
  logger.appendLine('='.repeat(50));
  logger.appendLine('Telegram VSCode extension activated');
  logger.appendLine(`Platform: ${os.platform()}`);
  logger.appendLine(`Extension path: ${context.extensionPath}`);
  logger.appendLine('='.repeat(50));

  try {
    // Start the server
    await startServer(context);
    logger.appendLine('✓ Server started successfully');
    vscode.window.showInformationMessage('Telegram proxy server started');
  } catch (error) {
    const errorMsg = `Failed to start Telegram proxy server: ${error.message}`;
    vscode.window.showErrorMessage(errorMsg);
    logger.appendLine(`✗ ${errorMsg}`);
    logger.appendLine('Stack trace:');
    logger.appendLine(error.stack || 'No stack trace available');
  }

  // Register command to open Telegram in a tab
  const openCommand = vscode.commands.registerCommand(
    COMMAND_ID,
    () => {
      try {
        logger.appendLine('Opening Telegram panel...');
        createTelegramPanel();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to open Telegram: ${error.message}`
        );
        logger.appendLine(`Failed to create panel: ${error.message}`);
      }
    }
  );

  // Register webview view provider for sidebar
  const viewProvider = vscode.window.registerWebviewViewProvider(
    WEBVIEW_ID,
    {
      resolveWebviewView(webviewView) {
        logger.appendLine('Resolving sidebar webview...');
        
        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: []
        };
        
        webviewView.webview.html = getWebviewContent();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage((message) => {
          switch (message.type) {
            case 'iframe-loaded':
              logger.appendLine('Telegram sidebar iframe loaded successfully');
              break;
            default:
              logger.appendLine(`Unknown message type: ${message.type}`);
          }
        });
      }
    }
  );

  // Add to subscriptions
  context.subscriptions.push(
    openCommand,
    viewProvider,
    logger,
    {
      dispose: () => {
        stopServer();
      }
    }
  );
}

/**
 * Deactivate the extension
 */
function deactivate() {
  logger.appendLine('Deactivating extension...');
  stopServer();
  if (logger) {
    logger.appendLine('Telegram VSCode extension deactivated');
    logger.dispose();
  }
}

module.exports = {
  activate,
  deactivate
};